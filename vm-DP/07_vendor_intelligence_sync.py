"""Stage 07 - vendor advisory intelligence.

Implemented source: AWS Amazon Linux 2/2023 ALAS RSS.
The data model is vendor-neutral so additional advisory parsers can be added
without changing canonical vulnerability identity.

This stage does not invent affected/fixed package versions when the feed does
not provide them. It stores the authoritative advisory text and identifiers.
"""
from __future__ import annotations
import html, os, re, time, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
import requests, pymongo
from dotenv import load_dotenv
load_dotenv()
from importlib.util import spec_from_file_location, module_from_spec
_spec=spec_from_file_location('common',Path(__file__).with_name('00_pipeline_common.py')); common=module_from_spec(_spec); _spec.loader.exec_module(common)
log=common.setup_logging('stage07'); TIMEOUT=int(os.getenv('VENDOR_FEED_TIMEOUT','30'))

def cves(text): return sorted(set(re.findall(r'\bCVE-\d{4}-\d{4,10}\b',html.unescape(str(text or '')),flags=re.I)))

def fetch(url, retries=3):
    for attempt in range(1, retries + 1):
        try:
            r=requests.get(url,timeout=TIMEOUT,headers={'User-Agent':os.getenv('PIPELINE_USER_AGENT','Enterprise-Vulnerability-Intel/2.0')})
            r.raise_for_status()
            return r.content
        except Exception as exc:
            if attempt == retries:
                raise
            time.sleep(min(2 ** attempt, 10))

def parse_alas(xml_bytes,os_name,feed_url):
    root=ET.fromstring(xml_bytes); result=[]
    for item in root.findall('./channel/item'):
        def text(tag):
            n=item.find(tag); return n.text.strip() if n is not None and n.text else None
        title=text('title') or ''; desc=text('description') or ''; link=text('link'); pub=text('pubDate'); advisory=title.split(':',1)[0].strip() if ':' in title else title
        result.append({'advisory_id':advisory,'vendor':'AWS','product_family':os_name,'os_distribution':'Amazon Linux','os_release':os_name.replace('Amazon Linux ','') if os_name.startswith('Amazon Linux ') else None,'title':title,'description':desc,'url':link,'published_at':pub,'identifiers':{'alas':[advisory],'cve':cves(title+' '+desc)},'source': 'AWS_ALAS','source_url':feed_url})
    return result

def main():
    run=common.run_id(); client,db=common.connect_db(); adv=db['vendor_advisories']; cve=db['cve_database']
    feeds={'Amazon Linux 2':'https://alas.aws.amazon.com/AL2/alas.rss','Amazon Linux 2023':'https://alas.aws.amazon.com/AL2023/alas.rss'}
    failed_feeds=[]
    advisories_synced=0
    try:
        for os_name,url in feeds.items():
            try:
                records=parse_alas(fetch(url),os_name,url)
                advisories_synced+=len(records)
            except Exception as exc:
                log.exception('ALAS feed %s failed: %s', os_name, exc)
                failed_feeds.append((os_name, str(exc)))
                continue
            for rec in records:
                aid=rec['advisory_id']; rec.update({'_id':f"aws:alas:{aid}",'synced_at':common.utc_now(),'pipeline':{'stage':'07_vendor_intelligence_sync','run_id':run}})
                doc_id=rec.pop('_id'); adv.update_one({'_id':doc_id},{'$set':rec},upsert=True)
                for cid in rec['identifiers'].get('cve',[]):
                    cve.update_one({'_id':cid},{'$addToSet':{'vendor_intelligence.advisories':{'vendor':'AWS','advisory_id':aid,'os':os_name,'url':rec.get('url'),'synced_at':common.utc_now()}}})
        for key in [[('vendor',1),('advisory_id',1)],[('product_family',1),('os_release',1)],[('identifiers.cve',1)],[('synced_at',-1)]]: adv.create_index(key)
        if len(failed_feeds) == len(feeds):
            raise RuntimeError(f"All vendor intelligence feeds failed: {failed_feeds}")
        elif failed_feeds:
            log.warning("Stage 07 partially succeeded (%s advisories), but some feeds failed: %s", advisories_synced, failed_feeds)
        else:
            log.info('Stage 07 complete: %s advisories synced', advisories_synced)
    finally: client.close()

if __name__=='__main__': main()
