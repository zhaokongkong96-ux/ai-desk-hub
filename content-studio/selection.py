"""Editorial choices and exact script approval shared by API and workflow."""
import hashlib
import json
from pathlib import Path

def version(plan):
    return hashlib.sha256(json.dumps(plan,sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def script_version(plan):
    return version({"selection":plan.get("selection"),"script":plan.get("script")})

def proposals(row):
    catalog=json.loads((Path(__file__).parent/"topic-options.json").read_text())
    if row["url"] in catalog:
        return catalog[row["url"]]
    return {"display_title":row["title"],"overview":row["summary"],"angles":[
        {"id":"a","title":"从事情本身讲起","focus":"围绕《"+row["title"]+"》，核对发生了什么、原文依据及仍未确定的部分。"},
        {"id":"b","title":"从人的体验切入","focus":"围绕报道中的对象，研究它与使用者或当地居民体验的联系。先找证据，再决定结论。"}]}

def require_selection(plan):
    choice=plan.get("selection",{})
    if not choice.get("confirmed_at"):
        raise ValueError("请先选择选题和切入角度，并确认方向")
    return choice

def invalidate_script(plan):
    for key in ["script","storyboard","script_approval"]:
        plan.pop(key,None)
    plan["status"]="direction_pending"
