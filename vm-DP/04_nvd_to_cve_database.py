"""Stage 04 - stream NVD CVEs into canonical cve_database.

This stage intentionally does not load a complete NVD file into memory.
It also avoids fabricating CPEs from vendor/product strings.
"""
from __future__ import annotations
import gzip, json, os, re
from pathlib import Path
# pyrefly: ignore [missing-import]
import ijson, pymongo
from dotenv import load_dotenv
from tqdm import tqdm
load_dotenv()
from importlib.util import spec_from_file_location, module_from_spec
_spec=spec_from_file_location("common",Path(__file__).with_name("00_pipeline_common.py")); common=module_from_spec(_spec); _spec.loader.exec_module(common)
log=common.setup_logging("stage04"); WORK=Path(common.get_working_dir()); EX=WORK/"extracted_json"; BATCH=int(os.getenv("CVE_BATCH_SIZE","1000"))
RUN: str = ""
SOURCE_FILE: str = ""

def description(ds):
    for x in ds or []:
        if x.get("lang")=="en" and x.get("value"): return x["value"].strip()
    return ""

def cvss(metrics):
    if not isinstance(metrics,dict): return {}
    for key in ("cvssMetricV40","cvssMetricV4","cvssMetricV31","cvssMetricV30","cvssMetricV2"):
        arr=metrics.get(key) or []
        if not arr: continue
        m=arr[0] or {}; d=m.get("cvssData",{}) or {}
        score=d.get("baseScore")
        try: score=float(score) if score is not None else None
        except (ValueError, TypeError): pass
        return {"version":d.get("version"),"baseScore":score,"baseSeverity":m.get("baseSeverity") or d.get("baseSeverity"),"vectorString":d.get("vectorString"),"attackVector":d.get("attackVector"),"attackComplexity":d.get("attackComplexity"),"privilegesRequired":d.get("privilegesRequired"),"userInteraction":d.get("userInteraction"),"scope":d.get("scope"),"confidentialityImpact":d.get("confidentialityImpact"),"integrityImpact":d.get("integrityImpact"),"availabilityImpact":d.get("availabilityImpact")}
    return {}

def cwes(problem_types):
    ids=set()
    for pt in problem_types or []:
        for d in pt.get("descriptions",[]) or []:
            text=d.get("description","")
            ids.update(re.findall(r"CWE-\d+",text,re.I))
            if d.get("cweId"): ids.add(d["cweId"])
    return sorted(x.upper() for x in ids if x.upper().startswith("CWE-"))

def cpe_matches(configs):
    out=[]
    for cfg in configs or []:
        for node in cfg.get("nodes",[]) or []:
            for m in node.get("cpeMatch",[]) or []:
                if m.get("vulnerable") and m.get("criteria"):
                    out.append({k:m.get(k) for k in ("criteria","matchCriteriaId","versionStartIncluding","versionStartExcluding","versionEndIncluding","versionEndExcluding","vulnerable") if m.get(k) is not None})
    return out

def process(record, epss_map:dict, kev_map:dict):
    c=record.get("cve",{}); cid=c.get("id")
    if not cid: return None
    refs=sorted(set(r.get("url") for r in c.get("references",[]) or [] if isinstance(r,dict) and r.get("url")))
    aliases=sorted(set(c.get("aliases",[]) or []))
    kev=kev_map.get(cid)
    return {"_id":cid,"dataVersion":c.get("vulnStatus") or "NVD 2.0","published":c.get("published"),"lastModified":c.get("lastModified"),"source":c.get("sourceIdentifier"),"description":description(c.get("descriptions")),"cvss":cvss(c.get("metrics")),"cwes":cwes(c.get("problemTypes")),"references":refs,"cpe_uris":sorted(set(x["criteria"] for x in cpe_matches(c.get("configurations")) if x.get("criteria"))),"cpe_matches":cpe_matches(c.get("configurations")),"epss":epss_map.get(cid),"cisa_kev":bool(kev),"cisa_kev_details":kev,"aliases":aliases,"pipeline":{"stage":"04_nvd_to_cve_database","run_id":RUN,"source_file":SOURCE_FILE}}

def load_epss():
    path=WORK/"epss_score.csv.gz"; result={}
    if not path.exists(): return result
    with gzip.open(path,"rt",encoding="utf-8",errors="replace") as fh:
        for line in fh:
            if line.startswith("#") or line.lower().startswith("cve,"): continue
            parts=line.rstrip("\n").split(",")
            if len(parts)>=2:
                try: result[parts[0]]=float(parts[1])
                except ValueError: pass
    return result

def load_kev():
    path=EX/"cisa_kev.json"; result={}
    if not path.exists(): return result
    data=json.loads(path.read_text(encoding="utf-8"))
    for x in data.get("vulnerabilities",[]):
        if x.get("cveID"): result[x["cveID"]]=x
    return result

def main():
    global RUN,SOURCE_FILE; RUN=common.run_id(); epss=load_epss(); kev=load_kev(); client,db=common.connect_db(); coll=db["cve_database"]
    try:
        for path in sorted(EX.glob("nvd_*.json")):
            SOURCE_FILE=path.name
            with open(path,"rb") as fh:
                ops=[]
                for record in tqdm(ijson.items(fh,"vulnerabilities.item",use_float=True),desc=path.name,unit="cve"):
                    doc=process(record,epss,kev)
                    if doc:
                        did=doc.pop("_id"); ops.append(pymongo.UpdateOne({"_id":did},{"$set":doc},upsert=True))
                    if len(ops)>=BATCH:
                        coll.bulk_write(ops,ordered=False); ops=[]
                if ops: coll.bulk_write(ops,ordered=False)
        for keys in [[("aliases",1)],[("cvss.baseSeverity",1)],[("cvss.baseScore",-1)],[("epss",-1)],[("cisa_kev",1)],[("cpe_uris",1)],[("cpe_matches.criteria",1)]]: coll.create_index(keys)
        log.info("Stage 04 complete")
    finally: client.close()
if __name__=="__main__": main()
