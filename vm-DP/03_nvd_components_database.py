"""Stage 03 - build/update canonical component intelligence from NVD CPE and OSV.

Important: this stage NEVER drops components_database. It incrementally upserts
component identities and preserves source-specific matching rules.
"""
from __future__ import annotations
import json, os, re
from collections import defaultdict
from pathlib import Path
# pyrefly: ignore [missing-import]
import ijson, pymongo
from dotenv import load_dotenv
from tqdm import tqdm
load_dotenv()
from importlib.util import spec_from_file_location, module_from_spec
_spec=spec_from_file_location("common",Path(__file__).with_name("00_pipeline_common.py")); common=module_from_spec(_spec); _spec.loader.exec_module(common)
log=common.setup_logging("stage03"); WORK=Path(common.get_working_dir()); EX=WORK/"extracted_json"; BATCH=int(os.getenv("COMPONENT_BATCH_SIZE","1000"))
RUN: str = ""

def cpe_parts(cpe:str)->list[str]:
    if not cpe: return []
    # CPE 2.3 uses escaped colons; split only on unescaped ':' for stable field extraction.
    parts=[]; cur=[]; escaped=False
    for ch in cpe:
        if escaped: cur.append(ch); escaped=False
        elif ch=='\\': escaped=True
        elif ch==':': parts.append(''.join(cur)); cur=[]
        else: cur.append(ch)
    parts.append(''.join(cur)); return parts

def cpe_identity(cpe:str)->dict:
    p=cpe_parts(cpe); out={"cpe":cpe}
    if len(p)>=6 and p[0]=="cpe" and len(p)>2 and p[1]=="2.3":
        # Standard 2.3: cpe,2.3,type,vendor,product,version,...
        if len(p)>6:
            out.update({"part":p[2],"vendor":p[3],"product":p[4],"version":p[5]})
            target_sw=p[12] if len(p)>12 else None
            if target_sw and target_sw!='*': out["target_sw"]=target_sw
    return out

def component_type(cpe:dict)->str:
    part=cpe.get("part"); target=(cpe.get("target_sw") or "").lower(); product=(cpe.get("product") or "").lower()
    if part=="o": return "operating_system"
    if part=="h": return "hardware"
    if any(x in target for x in ("node","npm","python","jvm","java","dotnet")): return "application_package"
    if any(x in product for x in ("linux","windows","ubuntu","debian","red_hat","rhel","amazon_linux")): return "operating_system"
    return "software"

def ecosystem(cpe:dict)->str|None:
    v=(cpe.get("vendor") or "").lower(); p=(cpe.get("product") or "").lower(); t=(cpe.get("target_sw") or "").lower()
    if any(x in v or x in p for x in ("ubuntu",)): return "Ubuntu"
    if any(x in v or x in p for x in ("debian",)): return "Debian"
    if any(x in v or x in p for x in ("redhat","red_hat","rhel")): return "Red Hat"
    if "amazon" in v or "amazon_linux" in p: return "Amazon Linux"
    if "alpine" in v or "alpine" in p: return "Alpine"
    if "suse" in v or "opensuse" in p: return "SUSE"
    if "rocky" in v or "rocky" in p: return "Rocky Linux"
    if "alma" in v or "alma" in p: return "AlmaLinux"
    if "node" in t or "npm" in t: return "npm"
    if "python" in t: return "PyPI"
    if "java" in t or "jvm" in t: return "Maven"
    if "dotnet" in t or ".net" in t: return "NuGet"
    return None

def strategy(matches:list[dict])->dict:
    ranges=[]; explicit=[]; wild=False
    for m in matches:
        ci=m.get("criteria",""); cp=cpe_identity(ci); ver=cp.get("version")
        if ver and ver!='*': explicit.append(ver)
        bounds={k:m.get(k) for k in ("versionStartIncluding","versionStartExcluding","versionEndIncluding","versionEndExcluding") if m.get(k) is not None}
        if bounds: ranges.append(bounds)
        if ver in (None,'*') and not bounds: wild=True
    if ranges and explicit: kind="mixed"
    elif ranges: kind="range"
    elif explicit: kind="explicit"
    elif wild: kind="wildcard"
    else: kind="unknown"
    return {"strategy":kind,"ranges":ranges,"explicit_versions":sorted(set(explicit)),"affects_all_versions":kind=="wildcard"}

def upsert_component(coll, data:dict):
    key=common.canonical_component_key(data["component_type"],data.get("ecosystem"),data.get("name"),data.get("vendor"),data.get("namespace"),data.get("purl"),data.get("cpe"))
    doc={"_id":key,"component_type":data["component_type"],"name":data.get("name"),"vendor":data.get("vendor"),"ecosystem":data.get("ecosystem"),"namespace":data.get("namespace"),"purl":data.get("purl"),"identifiers":data.get("identifiers",{}),"vulnerabilities":data.get("vulnerabilities",[]),"updated_at":common.utc_now(),"pipeline":{"stage":"03_nvd_components_database","run_id":RUN}}
    coll.update_one({"_id":key},{"$set":doc,"$addToSet":{"sources":{"$each":data.get("sources",[])}}},upsert=True)

def process_nvd(coll):
    count=0
    for path in sorted(EX.glob("nvd_*.json")):
        if path.name.startswith("nvd_" ) is False: continue
        with open(path,"rb") as fh:
            for vuln in tqdm(ijson.items(fh,"vulnerabilities.item",use_float=True),desc=f"NVD {path.name}",unit="cve"):
                cve=vuln.get("cve",{}); cve_id=cve.get("id");
                if not cve_id: continue
                for cfg in cve.get("configurations",[]) or []:
                    for node in cfg.get("nodes",[]) or []:
                        for m in node.get("cpeMatch",[]) or []:
                            if not m.get("vulnerable") or not m.get("criteria"): continue
                            cp=cpe_identity(m["criteria"]); typ=component_type(cp); eco=ecosystem(cp)
                            doc={"component_type":typ,"name":cp.get("product"),"vendor":cp.get("vendor"),"ecosystem":eco,"cpe":m["criteria"],"identifiers":{"cpe":[m["criteria"]]},"vulnerabilities":[{"vulnerability_id":cve_id,"identifiers":{"cve":[cve_id]},"version_targeting":strategy([m]),"source":"NVD"}],"sources":["NVD"]}
                            upsert_component(coll,doc); count+=1
    return count

def process_osv(coll):
    count=0
    for path in sorted(EX.glob("osv_*.json")):
        try:
            with open(path,"rb") as fh:
                for record in tqdm(ijson.items(fh,"item",use_float=True),desc=f"OSV {path.name}",unit="record"):
                    for affected in record.get("affected",[]) or []:
                        pkg=affected.get("package",{}) or {}; name=pkg.get("name"); eco=common.normalize_ecosystem(pkg.get("ecosystem")); purl=pkg.get("purl")
                        if not name and not purl: continue
                        ids=[record.get("id")]+list(record.get("aliases",[]) or []); ids=[x for x in ids if x]
                        rules=[]
                        for r in affected.get("ranges",[]) or []: rules.append({"type":r.get("type"),"repo":r.get("repo"),"events":r.get("events",[])})
                        entry={"vulnerability_id":record.get("id"),"identifiers":{"types":sorted({common.classify_identifier(x) for x in ids}),"ids":sorted(set(ids))},"version_targeting":{"strategy":"osv_events","ranges":rules,"explicit_versions":affected.get("versions",[]) or []},"source":"OSV"}
                        upsert_component(coll,{"component_type":"os_package" if eco in {"Ubuntu","Debian","Red Hat","Amazon Linux","Alpine","SUSE","Rocky Linux","AlmaLinux","openSUSE"} else "application_package","name":name,"ecosystem":eco,"purl":purl,"identifiers":{"purl":[purl]} if purl else {},"vulnerabilities":[entry],"sources":["OSV"]}); count+=1
        except Exception as exc:
            log.warning("Skipping corrupted or incomplete OSV file %s: %s", path.name, exc)
    return count

def indexes(coll):
    for keys in [[("ecosystem",1),("name",1)],[ ("purl",1) ],[("vendor",1),("name",1)],[("component_type",1)],[("vulnerabilities.vulnerability_id",1)],[("vulnerabilities.identifiers.ids",1)]]: coll.create_index(keys)

def main():
    global RUN; RUN=common.run_id(); client,db=common.connect_db()
    try:
        coll=db["components_database"]
        skip_nvd=os.getenv("SKIP_NVD_COMPONENTS","").lower() in ("1","true","yes")
        if skip_nvd: log.info("SKIP_NVD_COMPONENTS set: skipping NVD CPE processing")
        a=0 if skip_nvd else process_nvd(coll); b=process_osv(coll); indexes(coll); log.info("Stage 03 complete: %s NVD relationships, %s OSV relationships",a,b)
    finally: client.close()
if __name__=="__main__": main()
