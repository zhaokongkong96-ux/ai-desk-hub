"""Install a user LaunchAgent for this Mac, without exposing tokens in the plist."""
import os
import plistlib
import subprocess
import shutil
import time
from pathlib import Path
from store import ROOT, DATA

runtime=Path.home()/"Library/Application Support/AIContentStudio"
runtime.mkdir(parents=True,exist_ok=True)
# launchd cannot read Documents without user privacy changes. Deploy a runtime
# snapshot to Application Support and retain original project sources.
shutil.copytree(ROOT,runtime,dirs_exist_ok=True,symlinks=True,
                ignore=lambda directory,names: [
                    name for name in names if name in {".git","__pycache__"} or (name=="data" and Path(directory)==ROOT)
                    or (name in {".venv",".tools","node_modules"} and
                        (runtime/Path(directory).relative_to(ROOT)/name).exists())])
if not (runtime/"data").exists():
    shutil.copytree(DATA,runtime/"data")
(runtime/"web").mkdir(exist_ok=True)
for name in ["content-studio.html","studio.js","studio-preview.json","studio-transport.js","studio-config.json"]:
    shutil.copy2(ROOT.parent/name,runtime/"web"/name)
label="com.aideskhub.content-studio"
path=Path.home()/"Library/LaunchAgents"/(label+".plist")
path.parent.mkdir(parents=True,exist_ok=True)
env={"STUDIO_SCHEDULE":"true","STUDIO_VOICE":"macos","STUDIO_IMAGE_PROVIDER":"local",
     "PATH":"/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"}
if os.environ.get("STUDIO_PROXY"):
    env["STUDIO_PROXY"]=os.environ["STUDIO_PROXY"]
content={"Label":label,"ProgramArguments":[str(runtime/".venv/bin/python"),"-m","uvicorn",
          "server:app","--host","0.0.0.0","--port","8876"],"WorkingDirectory":str(runtime),
         "RunAtLoad":True,"KeepAlive":True,"EnvironmentVariables":env,
         "StandardOutPath":str(runtime/"data/service.log"),"StandardErrorPath":str(runtime/"data/service-error.log")}
path.write_bytes(plistlib.dumps(content))
domain="gui/"+str(os.getuid())
subprocess.run(["launchctl","bootout",domain+"/"+label],capture_output=True)
for _ in range(25):
    state=subprocess.run(["launchctl","print",domain+"/"+label],capture_output=True)
    if state.returncode:
        break
    time.sleep(0.2)
subprocess.run(["launchctl","bootstrap",domain,str(path)],check=True)
print("Installed background service",label)
