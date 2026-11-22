<h1 align="center">AI All-Round Bench</h1>

<p align="center"><b>Website: <a href="https://octathlon.wendystars.com/en/">octathlon.wendystars.com</a></b></p>

<p align="center"><a href="README.md">简体中文</a> | English</p>

<p align="center">Timed challenges for AI coding agents. The platform handles timing, isolation, reminders, continuation and grading dispatch; each topic has its own tasks, time rules, evaluation and website.</p>

<p align="center">The task statements and grading guides in this repository are in Chinese.</p>

---

## Contents

- [Introduction](#introduction)
- [Topics](#topics)
- [How Tests Run](#how-tests-run)
- [Repository Layout](#repository-layout)
- [General Principles](#general-principles)
- [License](#license)

## Introduction

- **What it is**: a timed benchmark platform for AI coding agents. Tasks are organized into topics; each topic is a self-contained benchmark with its own statements, time rules, evaluation, website and films.
- **Who is tested**: the model together with its own agent tooling, such as Claude Code or Codex. Each topic registers its tested models, the agent used and the reasoning effort in the topic folder's `参测.json`.
- **How**: each task opens a new session and is answered independently in an isolated environment. Nobody answers questions, the session is stopped as soon as time is up, and whatever is left in the work folder is the submission.
- **How it is judged**: decided by the topic. Graded topics score with programmatic checks and AI graders, combine the scores by weight into a total and rank the models; showcase topics are not scored and only show each model's works.
- **Website**: the hub at [octathlon.wendystars.com](https://octathlon.wendystars.com/en/) lists the topics, and each topic that is online has its own site under `/<topic id>/`.

## Topics

| Topic | What it is about | Tasks | Evaluation | Website |
|---|---|---|---|---|
| [AI Decathlon](专题/十项全能/README.en.md) (`decathlon`) | An all-round timed challenge for coding agents: from Lean formal proofs, competition math, performance optimization and algorithm battles to designing and developing complete web works and a desktop system | 13 tasks in 10 categories, 60–100 minutes each | Graded: programmatic checks and two AI graders, combined by weight into a total and ranked | [/decathlon/](https://octathlon.wendystars.com/decathlon/en/) |
The tasks, what they test and the scoring details are in each topic's README.

## How Tests Run

The mechanisms below are shared by all topics. Each task's time limits, deliverable and answering resources are written in the topic manifest `专题/<topic>/专题.json`, and the calls to continue and the reminders are configured by the topic; arrangements specific to a topic are in its README.

### Who Runs the Tests

| Role | What it is | What it does |
|---|---|---|
| Host | One resident process per tested session | Starts the agent, sends the opening prompt, delivers reminders, calls the agent back or submits after each round according to the time rule, and stops the session at time; it is kept after time and closed only by the commander |
| Supervisor | A resident process with no AI in it | Checks deadlines and reminder times every 2 seconds, acts as the fallback at time, and dispatches grading; notifies the commander of time-ups, failures, the end of all grading, and newly appearing anomalies |
| Commander session | An AI session that follows the operations manual | Acts only on notifications: prepares work folders, launches batch by batch, handles failures and continuations, archives the logs of finished sessions, and reports at the end; one commander schedules all topics |
| Graders | The AI graders of graded topics | Score by the topic's grading guide; who grades and how is in each topic's README |

### How a Run Proceeds

| Item | Practice |
|---|---|
| Session | Each task opens a new session; timing starts once the Job, core protection and Agent initialization are ready |
| Time information | The statement, opening prompt, continuation prompts and reminders never state the time limit or the time left |
| Opening prompt | States where the statement is, the work folder, the deliverable, that the contents of the work folder are the final submission, and the rules for ending processes, and says that nobody answers questions and formats are judged leniently; a topic may add notes per task group |
| Ports | Tasks that need a local web server or a debugging port get dedicated ports per session from the platform, given in the opening prompt; statements never hard-code ports, so several models answering the same task at once do not collide |
| Questions | Apart from notices about system failures, the host sends only the fixed messages the topic has configured |
| Saving progress | Every task is judged only on the contents of the work folder when answering ends; save work promptly |
| End at time | The administrator ends this task's Job directly, and the host, Agent, commands, servers and browsers all exit with it; whatever is left in the work folder is the submission, and the session is kept on disk for resuming |
| Close and archive | close ends this task's Job by the holder PID and creation time registered by the administrator; clean ends Jobs whose time is up and archives their logs |

### Calls to Continue, Reminders and Submission

Every task has a maximum time and may also have a minimum time (`minutes` and `min_minutes` in the topic manifest):

| Time rule | When a round ends normally | How it ends |
|---|---|---|
| Maximum only | With more than 1 minute left, the next round starts within seconds (immediate continuation); in the last minute the host no longer continues and the session stays idle until time is up | Stopped at time |
| With a minimum | While the cumulative answering time is below the minimum, every round end is followed by a call to continue; once it is reached, a normal round end submits the work | Submitted, or force-stopped at the maximum time |

- **Calls and reminders:** what is said on continuing, and which tasks get a halfway overall-progress hint and when, are configured by the topic.
- **Delivery:** while the session is running, a reminder is inserted at the model's next tool call (via a hook in Claude Code, via `turn/steer` in Codex); when the session is idle, the host starts a new round with it.
- **No times given:** no message contains specific times.
- **Repeated idle rounds:** for tasks with a maximum only, if 3 continuations in a row make no tool calls, the host stops continuing and the session stays idle until time is up; reminders are still delivered.

<details>
<summary><b>De-duplicating and re-sending reminders</b></summary>

- Each kind of reminder is sent only once per stretch; the overall-progress hint is based on cumulative time spent on the whole task, so a hint already sent is not sent again on resuming.
- An overall-progress hint missed during an interruption is sent when the resumed stretch begins; it is not sent if the resumed stretch has 10 minutes or less from its start.
- When several timed reminders pile up at once, only the latest is delivered.

</details>

### Failures and Resuming

| Situation | Handling |
|---|---|
| API error, quota exhausted, host crash | Close the session; time left = this stretch's limit − time used, rounded up to the minute; reconnect to the original session with the time left, never retesting from scratch |
| First message after reconnecting | Says the session was interrupted by a system failure and earlier progress is kept, and restates the opening rules, without giving the time left |
| The original session cannot be reconnected | Open a new session in the original work folder and mention the system failure and the existing progress (naming the work folder) |
| A third failure on the same task | No more extra time; recorded as "anomaly (time extended)" |
| Failures after time is up, or a forced stop by the time-up fallback | No extra time |
| A task that needs the whole machine is being answered | Wait until that batch is out of time and cleaned up before resuming, without breaking its exclusive use |
| Launch failure | Investigate and launch once more; if the second launch also fails, record a launch failure |

### The Isolated Answering Environment

- **Account:** tested sessions run under a dedicated ordinary Windows account outside the administrators group. The task repository denies this account all access, including the original statements, grading materials and benchmark programs.
- **Work folder:** separate per topic, model and task; at the start only this task's statement and materials are copied in, and no Git repository is created.
- **Between sessions:** each session is a separate logon of this account, the session processes' permissions are narrowed to that logon, and sessions cannot end each other's processes.
- **Job object:** all of a session's processes are placed in one Windows job object. At time, child processes are ended along with it.
- **Agent permissions:** agents run with no sandbox and no approvals (Claude Code with `bypassPermissions`, Codex with `approvalPolicy=never`); what they can do is decided by the account's permissions.
- **Memory:** before each round of testing, the agents' memories in the tested account are cleared, and automatic memory is turned off while answering. Session logs are moved, after the session closes, to a location the tested account cannot read.
- **Browser MCP:** tested sessions connect to the same browser MCP (chrome-devtools-mcp), which uses the local headless Chrome and GPU, with a separate temporary user-data directory each time.
- **Machine:** answering and grading happen on the same machine: Windows 11, Intel Core i7-14700KF (8 performance cores + 12 efficiency cores, 28 logical processors), NVIDIA GeForce RTX 4080 (16 GB), 64 GB of memory.
- **Processes:** process lifecycles all go through `process_job.py`: one anonymous, non-inheritable Windows Job per piece of work, and ending the work ends the Job. Tested sessions and bench share session-host and the administrator session_owner; grading, dispatching and publishing use the same underlying runner; exports install the original CPU, memory and affinity limits on the same base. Only registered identities or this run's child process objects already held are ended; there is no sweeping by account, name, directory or process tree.

### Rules Shared by All Tasks

The "规定" (rules) section of every statement states the three rules below; other tool, network and work requirements follow each statement.

- Work alone throughout: no subagents and no multi-agent or parallel collaboration features.
- Read, create and modify files only inside the work folder and access no other paths, except the install paths and temporary directories that required tools such as compilers, interpreters and browsers must access.
- No logging in as another account (`runas` and the like); when a process has to be ended, end only processes you started, by PID, never in bulk by process name.

### Machine Resources and Parallelism

- **Batches:** a topic splits its tasks into batches; one model's different batches within the same topic are not answered at the same time. Different topics are limited only by machine resources.
- **Machine use:** while a task that declares exclusive use of the machine is being answered, no other answering starts; while a task that declares it needs a quiet machine is being answered, no grading runs.
- **Grading:** at most 16 main grading sessions run at the same time; performance grading runs one at a time with the machine to itself.

## Repository Layout

```text
AI-All-Round-Bench/
├─ README.md  README.en.md  LICENSE   platform README
├─ 平台/
│  ├─ 型号.json        model identities shared by the whole platform
│  └─ 厂商图标/         vendor icons shared by the hub, topic websites, films and covers
├─ 专题/<topic name>/   one per topic
│  ├─ 专题.json        topic manifest: id, categories, task groups, evaluation, and each task's time limits, deliverable and answering resources
│  ├─ README.md  README.en.md   topic README
│  ├─ 参测.json        tested models with their agent and reasoning effort
│  ├─ 题面/<category>/<task>.md   statements; a folder of the same name holds public materials given to the tested model
│  ├─ 评分/            graded topics only: grading guides, grading sheets, reference answers, hidden data and evaluation scripts
│  ├─ 设计/            the topic's design system, shared by its website, films, covers and README figures
│  └─ 专题/十项全能/assets/readme/   README figures (other topics keep theirs in their own folder the same way)
├─ website/
│  ├─ hub/             the hub, at the site root
│  ├─ topics/<id>/     each topic's site project, mounted at /<id>/
│  └─ tools/           export and publishing
└─ archives/<id>/      core archives: each model's submissions, grading results and costs
```

- Topic folders use the Chinese name; URLs, archives and local data use the English topic id (see [Topics](#topics)).
- The scheduling programs that run the benchmark, the tested models' work folders and the film projects live locally on the test machine, not in this repository.
- Adding a topic only adds its own folders and configuration: the manifest, README, tested-model register and statements (plus grading materials for a graded topic); a site project and a film template are added when it goes online or gets films. The platform code does not change.

## General Principles

### Setting the Tasks

- **Statements say what to make, not how**: statements give the theme, content and requirements; algorithms, libraries and code structure are left to the model. Where one technology is clearly the better fit, it is written directly as a requirement; pitfalls in the runtime environment are pointed out as they are.
- **Statements are written for the way strong models read**: only the design intent and the concrete content of the work. Values that can be inferred, results that come naturally once the system is built right, and words describing subjective impressions are left out; minor content gets one or two sentences.
- **Difficulty is calibrated by real runs**: AI estimates of time and difficulty are not trusted; to judge difficulty, a model actually does the task.

### Answering

- **Plain statements, no pressure**: statements and injected prompts contain only ordinary instructions, nothing like "capability competition" or "compared with other models". In graded topics, zero-score and deduction clauses appear only in the grading guides; statements only tell the model that grading is lenient about submission format.
- **Work alone, use the time**: nobody answers questions; when a model ends a round early, the host calls it back at once according to the time rule.

## License

This project is open-sourced under the [MIT License](LICENSE).
