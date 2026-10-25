"""Import a dated Accès Libre CSV export. Usage: python scripts/import-data.py input.csv"""
import csv,json,sys
from urllib.parse import urlparse,urlunparse
from pathlib import Path
source_url='https://static.data.gouv.fr/resources/accessibilite-des-etablissements-recevant-du-public-erp-pour-les-personnes-en-situation-de-handicap/20261024-230521/acceslibre-with-web-url.csv'
fields={'stepFree':'entree_plain_pied','route':'accueil_cheminement_plain_pied','width':'entree_largeur_mini','hearing':'accueil_equipements_malentendants_presence','toilets':'sanitaires_adaptes','consultation':'accueil_salle_consultation_accessible','signage':'accueil_signaletique_interieure'}
def boolean(s):return True if s=='True' else False if s=='False' else None
practices=[]
with open(sys.argv[1]) as f:
 for row in csv.DictReader(f):
  if not row.get('postal_code','').startswith('75'):continue
  if not any(w in row.get('activite','').lower() for w in ['médecin','médecine','dentiste','kinésithérap','centre de santé','maison de santé']):continue
  evidence={}
  for key,col in fields.items():
   value=float(row[col]) if key=='width' and row.get(col,'').isdigit() and int(row[col])>0 else None if key=='width' else boolean(row.get(col))
   evidence[key]={'value':value,'status':'declared' if value is not None else 'unknown','date':None,'source':'Accès Libre · déclaration publique'}
  if evidence['stepFree']['value'] is True and row.get('entree_marches','').isdigit() and int(row['entree_marches'])>0:evidence['stepFree']['status']='contradictory'
  booking=None
  for col in ['contact_url','site_internet']:
   try:
    u=urlparse(row.get(col,''))
    if u.scheme=='https' and u.hostname in ['www.doctolib.fr','doctolib.fr'] and not u.username and not u.password and len(u.path.strip('/').split('/'))>=2:
     booking=urlunparse(u._replace(fragment=''));break
   except ValueError:pass
  practices.append({'id':row['id'],'name':row['name'],'address':' '.join(x for x in [row.get('numero'),row.get('voie'),row['postal_code'],'Paris'] if x),'postalCode':row['postal_code'],'specialty':row['activite'],'source':'Accès Libre','sourceUrl':row['web_url'],'mode':'real','doctolibUrl':booking,'exportDate':'2026-10-24','evidence':evidence})
for i,name in enumerate(['Cabinet des Tilleuls','Centre médical Horizon','Cabinet du Square']):
 vals=[[True,True,95,True,True,None,True],[True,True,85,None,True,True,None],[False,None,72,False,None,None,True]][i]
 practices.append({'id':f'demo-{i+1}','name':name+' · exemple fictif','address':f'Paris {11+i}e · adresse fictive','postalCode':f'750{11+i}','specialty':'Médecin généraliste','source':'Scénario de démonstration','sourceUrl':None,'mode':'demo','doctolibUrl':None,'exportDate':None,'evidence':{k:{'value':v,'status':'declared' if v is not None else 'unknown','date':None,'source':'Donnée fictive, non vérifiée'} for k,v in zip(fields,vals)}})
Path('data').mkdir(exist_ok=True)
Path('data/practices.json').write_text(json.dumps(practices,ensure_ascii=False,separators=(',',':')))
Path('data/provenance.json').write_text(json.dumps({'publisher':'Accès Libre — Ministère de la Transition écologique','license':'Licence Ouverte / Etalab 2.0','dataset':'https://www.data.gouv.fr/datasets/acceslibre/','resource':source_url,'exportDate':'2026-10-24','importedAt':'2026-10-25','selection':'Paris (75), activités médicales sélectionnées, hors pharmacies et services administratifs','recordCount':len(practices)-3,'limitations':'Export ne contenant pas les dates de confirmation individuelles ; aucune date de vérification ni identité du contributeur supposée.'},ensure_ascii=False,indent=2))
print(f'Imported {len(practices)-3} real practices and 3 labeled fixtures.')
