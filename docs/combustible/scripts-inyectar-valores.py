# -*- coding: utf-8 -*-
"""
Inyecta el valor calculado (<v>) junto a cada formula (<f>) en el xlsx.

openpyxl escribe las formulas sin valor en cache: cualquier lector que use el cache
(pandas, openpyxl data_only=True, vistas previas) ve la celda vacia hasta que Excel
recalcula. LibreOffice no corre en este entorno, asi que calculamos en Python y
escribimos el cache a mano. La formula queda intacta y viva.

Las celdas con formula se DESCUBREN leyendo el archivo, no se hardcodean: asi no hay
riesgo de desalinearse si cambian las filas.
"""
import math, re, shutil, zipfile
from xml.etree import ElementTree as ET
import openpyxl

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
ET.register_namespace('', NS)
N = '{%s}' % NS
PATH = 'calculo_de_volumen_tanque.xlsx'
HOJA = 'PLANILLA MAESTRA'


def r0(x):
    """redondeo comercial (half-up), como Excel; no el bancario de round()"""
    return int(math.floor(x + 0.5))


# ---------- 1. descubrir formulas y calcular su valor ----------
wb = openpyxl.load_workbook(PATH)          # con formulas
ws = wb[HOJA]

RE_CAP = re.compile(r'^=ROUND\(PI\(\)\*\(G(\d+)/2\)\^2\*F\1\*1000,0\)$')
RE_LCM = re.compile(r'^=ROUND\(G(\d+)\*F\1\*10,0\)$')
RE_IF_CAP = re.compile(r'^=IF\(AND\(F(\d+)<>"",G\1<>""\),ROUND\(PI\(\)\*\(G\1/2\)\^2\*F\1\*1000,0\),""\)$')
RE_IF_LCM = re.compile(r'^=IF\(AND\(F(\d+)<>"",G\1<>""\),ROUND\(G\1\*F\1\*10,0\),""\)$')
RE_SUM = re.compile(r'^=SUM\(H(\d+):H(\d+)\)$')

esperado = {}      # (hoja, celda) -> valor ; None = cadena vacia
sumas = []
desconocidas = []

for row in ws.iter_rows():
    for c in row:
        if not (isinstance(c.value, str) and c.value.startswith('=')):
            continue
        f = c.value
        m = RE_CAP.match(f) or RE_IF_CAP.match(f)
        if m:
            r = int(m.group(1))
            L, D = ws[f'F{r}'].value, ws[f'G{r}'].value
            if L in (None, '') or D in (None, ''):
                esperado[(HOJA, c.coordinate)] = None
            else:
                esperado[(HOJA, c.coordinate)] = r0(math.pi * (D / 2) ** 2 * L * 1000)
            continue
        m = RE_LCM.match(f) or RE_IF_LCM.match(f)
        if m:
            r = int(m.group(1))
            L, D = ws[f'F{r}'].value, ws[f'G{r}'].value
            if L in (None, '') or D in (None, ''):
                esperado[(HOJA, c.coordinate)] = None
            else:
                esperado[(HOJA, c.coordinate)] = r0(D * L * 10)
            continue
        m = RE_SUM.match(f)
        if m:
            sumas.append((c.coordinate, int(m.group(1)), int(m.group(2))))
            continue
        desconocidas.append((c.coordinate, f))

# las sumas se resuelven despues, porque dependen de las celdas de arriba
for coord, r1, r2 in sumas:
    tot = 0
    for r in range(r1, r2 + 1):
        v = esperado.get((HOJA, f'H{r}'))
        if v is None:
            v = ws[f'H{r}'].value          # valor cargado a mano (no formula)
            v = 0 if not isinstance(v, (int, float)) else v
        tot += v
    esperado[(HOJA, coord)] = r0(tot)

# la unica formula del archivo original, cuyo cache openpyxl borro al guardar
esperado[('total', 'C11')] = 215474

if desconocidas:
    raise SystemExit(f'Formulas sin regla de calculo, abortando: {desconocidas}')

# ---------- 2. resolver nombre de hoja -> archivo xml ----------
zin = zipfile.ZipFile(PATH)
wbx = ET.fromstring(zin.read('xl/workbook.xml'))
rels = ET.fromstring(zin.read('xl/_rels/workbook.xml.rels'))
rid2target = {r.get('Id'): r.get('Target') for r in rels}
hoja2archivo = {}
for sh in wbx.iter(N + 'sheet'):
    tgt = rid2target[sh.get('{%s}id' % RNS)].lstrip('/')
    if not tgt.startswith('xl/'):
        tgt = 'xl/' + tgt
    hoja2archivo[sh.get('name')] = tgt

# ---------- 3. reescribir cada hoja afectada ----------
nuevo_xml = {}
resumen = []
for hoja in sorted({h for h, _ in esperado}):
    arch = hoja2archivo[hoja]
    root = ET.fromstring(zin.read(arch))
    vistas = set()
    for c in root.iter(N + 'c'):
        f = c.find(N + 'f')
        if f is None:
            continue
        ref = c.get('r')
        clave = (hoja, ref)
        if clave not in esperado:
            raise SystemExit(f'Formula sin valor esperado en {hoja}!{ref}')
        vistas.add(ref)
        val = esperado[clave]
        for viejo in list(c.findall(N + 'v')) + list(c.findall(N + 'is')):
            c.remove(viejo)
        v = ET.SubElement(c, N + 'v')
        if val is None:
            c.set('t', 'str')
            v.text = ''
        else:
            c.attrib.pop('t', None)
            v.text = str(val)
        c.remove(f)
        c.insert(0, f)                     # <f> va antes de <v>
    nuevo_xml[arch] = ET.tostring(root, encoding='UTF-8', xml_declaration=True)
    faltan = {ref for h, ref in esperado if h == hoja} - vistas
    resumen.append((hoja, len(vistas), sorted(faltan)))

# ---------- 4. reempaquetar, descartando calcChain ----------
ct = zin.read('[Content_Types].xml').decode('utf-8')
ct = re.sub(r'<Override[^>]*calcChain[^>]*/>', '', ct)
tmp = PATH + '.tmp'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename == 'xl/calcChain.xml':
            continue
        if item.filename == '[Content_Types].xml':
            zout.writestr(item, ct.encode('utf-8'))
        else:
            zout.writestr(item, nuevo_xml.get(item.filename, zin.read(item.filename)))
zin.close()
shutil.move(tmp, PATH)

print('--- valores inyectados ---')
for hoja, n, faltan in resumen:
    print(f'  {hoja}: {n} formulas' + (f'  | NO ENCONTRADAS EN EL XML: {faltan}' if faltan else ''))
print('--- detalle PLANILLA MAESTRA ---')
for (h, ref), v in sorted(esperado.items(), key=lambda kv: (kv[0][0], int(re.sub(r'\D', '', kv[0][1])), kv[0][1])):
    if h == HOJA:
        print(f'  {ref} = {"(vacio)" if v is None else format(v, ",")}')
