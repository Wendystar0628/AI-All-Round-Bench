<p align="center"><img src="assets/自述配图/hero-en.png" width="100%" alt="AI All-Round Bench: timed challenges for AI coding agents, organized by topic; online: AI Decathlon (13 tasks in 10 categories, 60–100 minutes each) and AI Aesthetics (a showcase of AI design, 10 directions, 60–150 minutes each); coming: AI Model Archaeology (7 periods)"></p>

<p align="center"><b>Website: <a href="https://octathlon.wendystars.com/en/">octathlon.wendystars.com</a></b>　|　<b>Test videos: <a href="https://space.bilibili.com/241360459/lists/9500819?type=season">Bilibili collection</a></b></p>

<p align="center"><a href="README.md">简体中文</a> | English</p>

<p align="center">Timed challenges for AI coding agents. The platform handles timing, isolation, calls back, resuming and grading dispatch; each topic has its own tasks, evaluation and website.</p>

<p align="center">The task statements and grading guides in this repository are in Chinese.</p>

---

## Contents

- [Introduction](#introduction)
- [Topic: AI Decathlon](#topic-ai-decathlon)
- [Topic: AI Aesthetics](#topic-ai-aesthetics)
- [Topic: AI Model Archaeology (Coming)](#topic-ai-model-archaeology-coming)
- [How Tests Run](#how-tests-run)
  - [Ground Rules](#ground-rules)
  - [How a Timed Run Goes](#how-a-timed-run-goes)
  - [Failures and Resuming](#failures-and-resuming)
  - [Fairness and Isolation](#fairness-and-isolation)
  - [From Time-Up to Score](#from-time-up-to-score)
- [Where Things Are](#where-things-are)
- [License](#license)

## Introduction

- **Who is tested**: the model together with its own coding agent, such as Claude Code, Codex or a vendor's own agent. Each topic registers its tested models, the agent used and the reasoning effort in the topic folder's `参测.json`.
- **How**: each task gets a new session and is answered alone in an isolated environment. Nobody answers questions, the session is stopped as soon as time is up, and whatever is left in the work folder is the submission.
- **How it is judged or shown**: up to each topic. The AI Decathlon grades by its guides, computing whatever can be computed and having AI graders score the rest, then combines the scores by weight into a ranked total. AI Aesthetics is a showcase of AI design: the tested models' works hang side by side by creative direction, and an AI judge writes a note on each direction.
- **Website**: the hub lists the topics, and each topic that is online has its own site under `/<topic id>/`: the AI Decathlon at [`/decathlon/`](https://octathlon.wendystars.com/decathlon/en/), AI Aesthetics at [`/aesthetics/`](https://octathlon.wendystars.com/aesthetics/en/).

## Topic: AI Decathlon

<p align="center"><img src="assets/自述配图/decathlon-en.png" width="100%" alt="AI Decathlon: 7 standard-judged tasks (Math Reasoning, Performance Optimization, Algorithm Battle, Spatial Reasoning, Geometric Modeling) and 6 open design tasks (Complex Interactive Apps, Game Design & Development, Physics Simulation, Visual Design & Rendering, System Architecture), 60–100 minutes each"></p>

| Task | Category | Time | In one line |
|---|---|:---:|---|
| [Formal Proofs](topics/十项全能/题面/数学推理/形式化证明题.md) | Math Reasoning | 60 min | Prove 8 theorems in Lean 4 + Mathlib so that they compile |
| [Original Math Olympiad Problems](topics/十项全能/题面/数学推理/数学竞赛原创试题.md) | Math Reasoning | 60 min | Write competition-style solutions to 24 original problems, no computing tools |
| [Ray Tracing Render Acceleration](topics/十项全能/题面/性能优化/性能工程/光线追踪渲染加速.md) | Performance Optimization | 60 min | Render a Jiangnan garden with CUDA within tolerance, as fast as possible |
| [Digital Circuit Simulator Acceleration](topics/十项全能/题面/性能优化/性能工程/数字电路仿真器加速.md) | Performance Optimization | 60 min | Simulate large synchronous circuits on the CPU, bit-exact and as fast as possible |
| [Siege & Conquest](topics/十项全能/题面/算法对抗/攻城略地.md) | Algorithm Battle | 60 min | Write a C++ bot that sends troops to capture nodes on a map |
| [Luban Lock Disassembly](topics/十项全能/题面/空间推理/鲁班锁拆解.md) | Spatial Reasoning | 60 min | Take 8 Luban locks fully apart by hand reasoning, in as few moves as possible |
| [Mechanical Structure Reconstruction](topics/十项全能/题面/几何建模/机械结构重建.md) | Geometric Modeling | 60 min | Read 25 sets of engineering drawings and write each 3D shape as a JSON model, by hand |
| [AE-Style Motion Design Editor](topics/十项全能/题面/复杂交互应用/AE风味动效设计编辑器.md) | Complex Interactive Apps | 60 min | Build a web motion design editor, then make a 15-second 「锻字」 (forging a character) demo with it |
| [Dynamic-Routing Tower Defense](topics/十项全能/题面/游戏设计与开发/动态路由塔防.md) | Game Design & Development | 90 min | Build a 3D tower defense set in cyberspace where fights over nodes reroute the invaders |
| [Jelly Impact and Wave Tank](topics/十项全能/题面/物理模拟/果冻冲击与造浪水槽.md) | Physics Simulation | 60 min | Simulate heavy balls smashing jelly, and balls of different densities in a wave tank |
| [Sunshower Fishing Harbor in 3D](topics/十项全能/题面/视觉设计与渲染/太阳雨渔港3D渲染.md) | Visual Design & Rendering | 100 min | Build a cel-shaded Three.js miniature of a small fishing harbor in a sunshower |
| [Interstellar Battle Fleet](topics/十项全能/题面/视觉设计与渲染/星际战舰编队.md) | Visual Design & Rendering | 90 min | Render a fleet of dozens of voxel warships live, the camera flying into the flagship |
| [Nested Operating Systems](topics/十项全能/题面/系统架构与实现/操作系统嵌套.md) | System Architecture & Implementation | 90 min | Build a nested desktop OS in which systems can launch further systems |

An all-round timed challenge for coding agents: from Lean formal proofs, competition math, performance optimization, algorithm battles, Luban lock disassembly and mechanical reconstruction to designing and developing complete web works and a desktop system. Results and details are on the website:

| To see | Go to |
|---|---|
| Overall ranking, score matrix, your own weights | [Leaderboard](https://octathlon.wendystars.com/decathlon/en/leaderboard/) |
| Scores by category | [Categories](https://octathlon.wendystars.com/decathlon/en/categories/) |
| Each model's total, category and per-task scores, with comparison and data downloads | [Models](https://octathlon.wendystars.com/decathlon/en/models/) |
| Each task's statement, what it tests, every model's score and the grading points | [Tasks](https://octathlon.wendystars.com/decathlon/en/tasks/) |
| How the challenge and its scoring work | [About](https://octathlon.wendystars.com/decathlon/en/about/) |
| Which models scored 0 on which task, and why | [Zero scores](https://octathlon.wendystars.com/decathlon/en/zeros/) |
| Common questions | [FAQ](https://octathlon.wendystars.com/decathlon/en/faq/) |
| Original statements, scoring formulas, the topic's own test arrangements | [Topic README](topics/十项全能/README.en.md) |

## Topic: AI Aesthetics

<p align="center"><img src="assets/自述配图/aesthetics-en.png" width="100%" alt="AI Aesthetics: a showcase of AI design in ten creative directions, in showcase order Motion Design, Toon Rendering, Whitebox Rendering, Creative Web Design, Large-Scale Scene Modeling, SVG Animation, Voxel Modeling, Hard-Surface Modeling, Game UI Design, Type & Logo Design; each task has a minimum and a maximum time between 60 and 150 minutes"></p>

A showcase of AI design: ten creative directions, one task each. Every tested model, with its own agent, builds a work alone from the same statement, and the works hang side by side by direction. The tasks run from a motion reel, a cel-shaded scene, a whitebox rendered in Blender and web art to a large scene, voxel and hard-surface models, SVG animation, a game interface and a game logo. Each task has a minimum and a maximum time; the flow, rules and isolation are the same as in other topics, see [How Tests Run](#how-tests-run).

| Work | Direction | Time (min–max) | In one line |
|---|---|:---:|---|
| [Modern Agent Concept PV](topics/审美全能/题面/动效设计/现代Agent概念PV.md) | Motion Design | 90–120 min | A concept PV of modern agents working together, its own score |
| [Stargazing Studio in an Autumn Garden](topics/审美全能/题面/卡通渲染/秋庭观星画室.md) | Toon Rendering | 90–150 min | An anime backdrop you can turn in your hands |
| [Glass Greenhouse and Florist's Workshop](topics/审美全能/题面/白模渲染/玻璃温室与花艺工作室.md) | Whitebox Rendering | 60–120 min | From bare geometry to golden hour |
| [NVIDIA B200 Web Art](topics/审美全能/题面/创意网页设计/NVIDIA_B200网页艺术.md) | Creative Web Design | 60–90 min | Every image grows from a single chip |
| [Holy City in the Sky](topics/审美全能/题面/大型场景建模/天穹圣城.md) | Large-Scale Scene Modeling | 90–150 min | A real, working city above a sea of clouds |
| [Twenty-Two Ways to Draw a Pelican](topics/审美全能/题面/SVG动画/鹈鹕的二十二种画法.md) | SVG Animation | 90–150 min | One ride through twenty-two art styles |
| [Clear Sky Water Park](topics/审美全能/题面/体素建模/晴空水上乐园.md) | Voxel Modeling | 90–150 min | Midsummer, built one block at a time |
| [Giant Mecha in a Rain-Swept Harbor](topics/审美全能/题面/硬表面建模/雨夜港口的巨型机甲.md) | Hard-Surface Modeling | 90–150 min | A massive silhouette from afar, layered armor up close |
| [Legend of the Floating Isles: Game UI](topics/审美全能/题面/游戏UI设计/浮空群岛传说游戏UI.md) | Game UI Design | 60–90 min | A full interface for a game that doesn't exist |
| [Anime Game Logo](topics/审美全能/题面/字体与Logo设计/二次元游戏Logo.md) | Type & Logo Design | 60–90 min | Each game's name, lettered anew |

Stills and downloads are on the website:

| To see | Go to |
|---|---|
| The ten directions and every model's work in each | [Volumes](https://octathlon.wendystars.com/aesthetics/en/volumes/) |
| All works by each designer (tested model) | [Designers](https://octathlon.wendystars.com/aesthetics/en/models/) |
| The AI judges who review the works, and the directions each one takes | [Judges](https://octathlon.wendystars.com/aesthetics/en/judges/) |
| How the showcase runs, how stills are chosen, how to open a downloaded work | [Notes](https://octathlon.wendystars.com/aesthetics/en/about/) |
| Original statements, times and ports | [Topic README (Chinese)](topics/审美全能/README.md) |

## Topic: AI Model Archaeology (Coming)

<p align="center"><img src="assets/自述配图/archaeology-en.png" width="100%" alt="AI Model Archaeology, coming: 7 periods by release date, all of 2024, the two halves of 2025 and the four quarters of 2026, ids archaeology1 to archaeology7; rosters set for period 1 (6 models) and period 4 (10 models), the rest to come"></p>

Flagship models since replaced by newer generations come back to the exam room, to show how AI coding agents have changed over time. The series has 7 periods by release date; each period is a topic of its own, with tasks set for that generation, and scores are compared only within a period. Every period is still in preparation: periods 1 and 4 have their rosters, and all tasks are being designed. Time spans, rosters and progress are in the [series README (Chinese)](topics/模型考古/README.md).

## How Tests Run

The mechanisms below are shared by all topics. Each task's maximum and minimum time, deliverable and answering resources are written in the topic manifest `topics/<topic>/专题.json`; the wording of opening and resume prompts, calls back and reminders is configured by the topic, and arrangements specific to a topic are in its README.

### Ground Rules

<p align="center"><img src="assets/自述配图/rules-en.png" width="100%" alt="Ground rules: a fresh session per task; work alone, no subagents; no time in prompts, while the ray-tracing and circuit statements state the limit and ship a time-left tool; stay in the work folder; stopped at time; grading and showcases use only what is left in the folder"></p>

The "规定" (rules) section of every statement states three of these: no subagents or multi-agent collaboration; read and write only inside the work folder; no logging in as another account, and end only processes you started, by PID. Other tool, network and work requirements follow each statement.

### How a Timed Run Goes

<p align="center"><img src="assets/自述配图/run-en.png" width="100%" alt="Timeline of a run: with a maximum time only, every round that ends is called back, no call back in the last minute, stopped at time; with a minimum time, at most 5 calls back before the minimum, and a normal round end after the minimum submits; after a failure the same session resumes with the time left"></p>

- **Clock start**: the opening prompt is released, and timing starts, only once the job object, process protection and the agent's initialization are ready.
- **Opening prompt**: says where the statement is, the work folder, the deliverable, the rules for staying in the folder and ending processes by PID, and asks the model to work on its own; a topic may add lines, as the AI Decathlon does to say that nobody answers questions and that grading is lenient about format, plus a few lines per task group.
- **Ports**: tasks that need a local web server or a debugging port get dedicated ports per session from the platform, given in the opening prompt; statements never hard-code ports.
- **Calls back and submission**: with a maximum time only, when a round ends normally with more than 1 minute left, the host calls the model back within seconds; after 3 calls back in a row with no tool call it stops calling back, and the run is stopped at time. With a minimum time as well, every round end before the cumulative minimum is called back, at most 5 times; once the minimum is reached or 5 calls back have been made, a normal round end submits, and the run is stopped at the maximum. AI Decathlon tasks have a maximum only; AI Aesthetics tasks also have a minimum.
- **Call-back wording and reminders**: what they say and which tasks get a halfway reminder are configured by the topic.
- **Time information**: opening prompts, calls back, reminders and resume prompts never state the limit or the time left. The AI Decathlon's ray-tracing and circuit tasks are the exception: their statements state the 60-minute limit and provide `数据\time_left.py` to check time used and left.

<details>
<summary><b>De-duplicating and re-sending reminders</b></summary>

- Each kind of reminder is sent only once per stretch; the halfway reminder is based on cumulative time on the whole task, so one already sent is not sent again on resuming.
- A halfway reminder missed during an interruption is sent when the resumed stretch begins, unless 10 minutes or less are left.
- When several timed reminders pile up at once, only the latest is delivered.

</details>

### Failures and Resuming

| Situation | Handling |
|---|---|
| API error, quota exhausted, host crash | Close the session; time left = this stretch's limit − time used, rounded up to the minute; resume the original session with the time left, never retesting from scratch |
| First message after resuming | Says the session was interrupted and earlier progress is kept, and restates the opening rules, without giving the time left |
| The original session cannot be resumed | Open a new session in the original work folder, telling it only about the failure and where the existing work is |
| A third ordinary failure on the same task | No more time; recorded as an anomaly. Interruptions caused by the service being at capacity are logged separately and may still resume with the time left |
| Failures after time is up, or a forced stop at time-up | No extra time |
| A task that needs the whole machine is being answered | Wait until that batch is out of time and cleaned up, without breaking its exclusive use |
| Launch failure | Investigate and launch once more; if that fails too, record a launch failure |

### Fairness and Isolation

<p align="center"><img src="assets/自述配图/isolation-en.png" width="100%" alt="Fairness and isolation: on one test machine the tested account is denied all access to the admin side; each tested session is an agent inside a work folder, a job object and its own logon; memory wiped, the same browser, own ports and machine claims"></p>

- **Batches**: a topic splits its tasks into batches; one model's batches within a topic never run at the same time, and different topics are limited only by machine resources.
- **Same conditions**: every model answers on the same machine with the same tools; processors and ports are assigned only as each task declares.

### From Time-Up to Score

<p align="center"><img src="assets/自述配图/grading-en.png" width="100%" alt="From time-up to score, for scored topics: collect at time, queue for the machine, main grading (up to 16 at once), speed grading (one at a time, machine to itself), combine, publish after confirmation and archive"></p>

Who grades and how scores are computed is up to each topic. In the AI Decathlon, standard-judged tasks get their scores from programmatic checks, and open design tasks are graded once each by two AI graders and averaged item by item; see [Scoring in the topic README](topics/十项全能/README.en.md#scoring).

For AI Aesthetics, once the works are collected, videos and fixed-position screenshots are exported from them, stills are picked for display, and most works are also packed for download; for each direction an AI judge looks at the works and writes a note. After confirmation they go online, and the works and costs are archived.

## Where Things Are

| What | Where |
|---|---|
| Topic manifest: tasks, times, answering resources and evaluation (plus weights in scored topics) | `topics/<topic>/专题.json` |
| Original statements and the public materials given to tested models | `topics/<topic>/题面/`, e.g. [topics/十项全能/题面/](topics/十项全能/题面/), [topics/审美全能/题面/](topics/审美全能/题面/) |
| Grading guides, blank score sheets, reference answers, hidden data and evaluation scripts (scored topics) | `topics/<topic>/评分/`, e.g. [topics/十项全能/评分/](topics/十项全能/评分/) |
| Tested models, their agents and reasoning effort | `topics/<topic>/参测.json` |
| Each model's submissions and costs, plus score sheets and evidence in scored topics (SHA256 per file) | [archives/](archives/)`<topic id>/<vendor>/<model>/` |
| Model identities and vendor icons | [models.json](models.json), [assets/厂商图标/](assets/厂商图标/) |
| Source of the hub and topic websites | [website/](website/) |
| Figures in this README | [assets/自述配图/](assets/自述配图/), rendered by `src/render.py` |

The scheduling programs that run the benchmark, the tested models' work folders and the film projects live locally on the test machine, not in this repository.

## License

This project is open-sourced under the [MIT License](LICENSE).
