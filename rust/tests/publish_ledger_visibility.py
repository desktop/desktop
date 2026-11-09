"""Publication ledger remains private while all registry views stay usable."""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import uuid

from publish_context import PublishFixture
from repository_accounts import call
from repository_context import private

MARKER='8765432109876543'


def hidden(value):
    encoded=json.dumps(value)
    assert 'publication_intents' not in encoded and MARKER not in encoded, 'Private ledger leaked'
    return value


def ledger(s):
    entries=json.loads(s.registry.read_text())['publication_intents']
    assert len(entries)==1 and entries[0]['remote_id']==int(MARKER)
    return entries


def main():
    original_home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-ledger-visibility-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        s=PublishFixture(root); s.configure(); f=s.local('saved repo')
        (f.path/'file').write_text('base\n'); f.commit()
        record=s.record(f); data=json.loads(s.registry.read_text())
        data['publication_intents']=[{'id':str(uuid.uuid4()),'repository_id':'a'*64,'common_id':'b'*64,
                                     'record_id':record['id'],'phase':'created','destination_hash':'c'*64,
                                     'remote_id':int(MARKER),'acknowledged':False}]
        private(s.registry,json.dumps(data)); before=ledger(s)
        users={key:dict(value) for key,value in s.data['users'].items()}
        users['AliceCase']['token']=MARKER; s.update(users=users)
        s.env['GH_TOKEN']=MARKER
        hidden(s.cli('repositories','list'))
        hidden(s.cli('repositories','select',f.path))
        other=s.local('other repo')
        hidden(s.cli('repositories','add',other.path))
        hidden(s.cli('repositories','forget',other.path))
        assert ledger(s)==before
        created=root/'initialized'
        hidden(s.cli('init',created))
        assert ledger(s)==before
        # Only this exact local source/destination is admitted by the test git wrapper.
        wrapper=root/'bin/git'; previous=root/'bin/git-safe'; wrapper.rename(previous)
        real=shutil.which('git'); assert real
        cloned=root/'local-clone'
        wrapper.write_text(f'#!{sys.executable}\n' + f'''import os,sys
from pathlib import Path
args=sys.argv[1:]
if 'clone' in args:
 assert args[-2:]==[{str(f.path)!r},{str(cloned)!r}]
 os.execv({real!r},[{real!r},*args])
os.execv(str(Path(__file__).with_name('git-safe')),[str(Path(__file__).with_name('git-safe')),*args])
''')
        wrapper.chmod(0o700)
        hidden(s.cli('clone',f.path,cloned))
        assert ledger(s)==before
        sibling=root/'occupied-worktree'; f.git('worktree','add','-qb','occupied',str(sibling))
        hidden(s.cli('-C',f.path,'checkout','occupied','--open-worktree'))
        assert ledger(s)==before
        with s.server(f) as ws:
            hidden(call(ws,'list_repositories'))
            hidden(call(ws,'forget_repository',path=str(created)))
            assert ledger(s)==before
        assert os.environ.get('HOME')==original_home
    print('PASS: CLI and WebSocket registry views hide but preserve private publication ledger',flush=True)


if __name__=='__main__': main()
