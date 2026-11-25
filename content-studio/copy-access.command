#!/bin/zsh
set -eu
cd "${0:A:h}"
/usr/bin/pbcopy < data/access-token
echo '访问令牌已复制。请粘贴到内容工作室的访问令牌框。'
