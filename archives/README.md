# 模型核心归档

模型核心归档按 `archives/<专题>/<厂商>/<型号>/` 存放。每个型号有一份 `manifest.json`，逐文件记录来源、题名、相对路径、字节数和 SHA256。

具备专题规定的归档条件后，在仓库根目录运行以下命令。对需要确认成片和封面的专题，请先完成确认。

```powershell
python orchestrator/archive.py archive <专题> "<厂商>/<型号>"
python orchestrator/archive.py verify <专题> "<厂商>/<型号>"
python orchestrator/archive.py verify <专题>
```

每道题的 `submission/` 保存清单指定的交付文件。清单省略 `archive.files` 时，平台按排除规则选取作答文件，跳过题面、材料、依赖、缓存及构建产物。题目声明的出片素材保存在 `assets/`，测试开销保存在 `cost.json`。打分评法提供的公开评分表和分段证据分别保存在 `scores/` 和 `grading/`。私有配对证据由专题插件单独保存。

本目录纳入 Git。提交物内的 `.gitignore` 和 `.gitattributes` 加 `.txt` 后缀保存原文，归档根的 `.gitattributes` 禁用换行转换，保证检出后仍可校验。清理前请先核验归档，并按专题说明保留后续出片需要的工程。
