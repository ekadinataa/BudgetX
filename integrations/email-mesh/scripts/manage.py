#!/usr/bin/env python3
"""Development checks and private config creation. Never collects or publishes."""
import argparse
import ast
import importlib.util
import json
import os
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))


def output(ok, **fields):
    print(json.dumps(dict(ok=ok,network_used=False,**fields),sort_keys=True))
    return 0 if ok else 1


def check():
    required=('mesh.py','mesh_parser.py','harvest.py','financial_review.py','financial_review_apply.py','financial_review_web.py','ops.py')
    for name in required:
        ast.parse((ROOT/name).read_text(),filename=name)
    return output(True,python=sys.version.split()[0],source_modules=len(required),sdk_available=all(importlib.util.find_spec(m) is not None for m in ('firebase_admin','googleapiclient')))


def init_config(target):
    target=Path(target)
    if not target.is_absolute() or target.is_symlink() or target.resolve()!=target.absolute():
        raise ValueError('absolute_non_symlink_output_required')
    if target.is_relative_to(ROOT) or target.is_relative_to(ROOT.parent.parent):
        raise ValueError('private_config_must_be_outside_repository')
    if target.parent.exists() and target.parent.stat().st_mode&0o077:
        raise ValueError('private_parent_directory_required')
    target.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
    c=json.loads((ROOT/'config.example.json').read_text())
    def expand(value):
        if isinstance(value,str):
            return value.replace('__STATE_DIR__',str(target.parent)).replace('__SOURCE_DIR__',str(ROOT))
        if isinstance(value,dict):return {k:expand(v) for k,v in value.items()}
        if isinstance(value,list):return [expand(v) for v in value]
        return value
    c=expand(c)
    if not isinstance(c, dict):
        raise ValueError('config_object_required')
    for flag in ('publish_enabled','financial_review_enabled','financial_review_web_enabled','destination_classification_enabled','destination_classification_notify_admin'):
        c[flag]=False
    c['harvest_dir']=str(ROOT)
    fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as handle:
        json.dump(c,handle,indent=2);handle.write('\n');handle.flush();os.fsync(handle.fileno())
    return output(True,created=True,publication_enabled=False,scheduler_installed=False)


def doctor(path):
    import mesh
    c=mesh.load_config(str(Path(path)))
    issues=[]
    mesh.validate_config(c)
    if not sys.platform.startswith('linux'):issues.append('linux_runtime_required')
    for key in ('db_path','token_path','firebase_admin_path','client_secret_path'):
        target=Path(c[key])
        if not target.is_absolute() or target.is_symlink():issues.append(key+':invalid_path')
        if key=='db_path':
            if target.parent.exists() and target.parent.stat().st_mode&0o077:issues.append(key+':parent_not_private')
        elif not target.is_file():issues.append(key+':missing')
        elif target.stat().st_mode&0o077:issues.append(key+':not_private')
    if '@example.invalid' in c.get('mailbox_email',''):issues.append('mailbox_not_configured')
    if any('REPLACE' in str(w.get('id','')) for w in c['registry']['wallets'].values()):issues.append('wallet_ids_not_configured')
    for module in ('firebase_admin','googleapiclient','google_auth_oauthlib'):
        if importlib.util.find_spec(module) is None:issues.append('dependency:'+module)
    return output(not issues,issues=issues,cloud_identity_verified=False,gmail_identity_verified=False,scheduler_installed=False)


def main(argv=None):
    os.umask(0o077)
    ap=argparse.ArgumentParser(description=__doc__)
    subs=ap.add_subparsers(dest='action',required=True)
    subs.add_parser('check')
    init=subs.add_parser('init-config');init.add_argument('--output',required=True)
    doc=subs.add_parser('doctor');doc.add_argument('--config',required=True)
    args=ap.parse_args(argv)
    try:
        if args.action=='check':return check()
        if args.action=='init-config':return init_config(args.output)
        return doctor(args.config)
    except Exception as exc:
        return output(False,error=type(exc).__name__,action='Check setup and private configuration; no collection or publication performed.')

if __name__=='__main__':raise SystemExit(main())
