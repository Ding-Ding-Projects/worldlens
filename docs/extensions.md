# Extensions

Extensions add commands to Worldlens: a program, in any language, that reads what you allow it to read and hands back a file. Three come built in, and the protocol is small enough to write one in a few minutes.

Manage them in **Settings → Extensions**: search them, see what each may read and how long it may run, turn them on or off, run their commands, and save or open what they produce.

## Built in

| Extension | Command | Reads | Gives back |
| --- | --- | --- | --- |
| Markers as CSV | Markers as CSV | the open map's markers | `markers.csv`, ready for a spreadsheet; text that would start a formula is neutralised |
| Markers as GeoJSON | Markers as GeoJSON | the open map's markers | `markers.geojson`, points for mapping and GIS tools (x east, z south, y as height) |
| Map report | Map report (Markdown) | the open map's name, id and marker counts | `map-report.md` |

Built-ins are on from the start because they ship with the app; they use the same manifest, protocol, permissions and limits as anything you add.

## Writing one

An extension is a folder with a manifest named `worldlens-extension.json` and the program it runs.

```json
{
  "manifestVersion": 1,
  "id": "marker-heights-node",
  "name": "Marker heights (Node sample)",
  "version": "1.0.0",
  "description": "Lists the open map's markers from highest to lowest.",
  "run": { "command": "node", "args": ["main.js"] },
  "permissions": ["read-markers", "produce-file"],
  "commands": [{ "id": "heights", "title": "Markers by height", "input": "markers" }],
  "limits": { "timeoutMs": 10000, "maxOutputBytes": 65536 }
}
```

- `id`: 2 to 64 lowercase letters, digits or hyphens, starting with a letter.
- `run.command`: `node` (runs on the app's own runtime, so nothing needs installing), `python`, `python3`, `py`, or a program inside the extension folder. A path outside the folder is refused.
- `permissions`: any of `read-markers` (labels, set names, types and block positions of the open map's markers), `read-map-summary` (the open map's name, id and marker counts per set) and `produce-file` (hand back a file for you to save).
- `commands`: 1 to 32, each with an `id`, a `title` and an `input` of `none`, `markers` or `map-summary`. A command that reads markers must declare `read-markers`, and so on.
- `limits`: `timeoutMs` from 500 to 60,000 (default 10,000) and `maxOutputBytes` from 1 KB to 16 MB (default 1 MB).

### The protocol

For each command run, Worldlens starts the program in its folder, writes one JSON line to standard input and closes it:

```json
{"protocol":1,"command":"heights","input":{"markers":[{"set":"Spawn","label":"Hall","type":"poi","x":0,"y":70,"z":0}]}}
```

The program writes one JSON line to standard output and exits:

```json
{"ok":true,"message":"1 markers sorted.","output":{"kind":"text","name":"marker-heights.txt","text":"  70  Hall (Spawn)\n"}}
```

or `{"ok":false,"message":"what went wrong"}`. `output` is optional. Standard error is kept (up to 64 KB) and shown under the result, which is the place for debugging output.

### Runnable samples

Two complete samples live in the repository under `docs/extensions-samples/`:

- `marker-count-python/`: counts markers per set and per type, in Python.
- `marker-heights-node/`: lists markers from highest to lowest, in JavaScript.

Install one with **Add an extension folder**, turn it on, open a map and run its command. To try one without the app, pipe a request into it:

```sh
echo '{"protocol":1,"command":"count","input":{"markers":[{"set":"Spawn","label":"Hall","type":"poi","x":0,"y":70,"z":0}]}}' | python3 docs/extensions-samples/marker-count-python/main.py
```

## Permissions and consent

Anything you add is off until you turn it on, and turning it on shows exactly what it may read and asks you to agree. Worldlens records the permission set you agreed to; if an update to the extension changes it, the extension switches off and asks again.

## Security

- An extension is a program that runs on this computer with your rights. Only add extensions you trust, the same as any other program.
- It runs one request at a time in its own process and is stopped at its time limit or when its answer passes its size limit.
- It receives only the input its command declares, built from the open map. Its environment is stripped to what a program needs to start (`PATH`, the system folder, temporary folders and language settings); tokens, keys and other variables are not passed on.
- Output names are reduced to a plain file name, and output is saved only where you choose.
- Importing copies the folder into the app's extensions folder and never replaces an installed extension with the same id.
- The hosted workspace refuses extensions: it does not start programs for visitors.

## Verification

- `design/packages/app/src/main/extensions/host.test.ts`: manifests name every problem, the three built-ins run and produce CSV (with formulas neutralised), GeoJSON and Markdown, consent is asked again when permissions change, no secret environment variable or undeclared input reaches a program, time and size limits stop a program, a program outside its folder is refused, and a malformed answer is reported plainly.
- `design/packages/app/src/main/extensions/samples.test.ts`: both samples in this guide have valid manifests and run through the host (the Python one where Python is installed).
- `design/packages/ui/src/components/extensions/ExtensionsPanel.test.ts`: permissions and limits shown, search, consent before turning on, no run without an open map, and marker rows without markup.

## 廣東話

擴充功能幫 Worldlens 加指令:用任何語言寫嘅程式,讀你准佢讀嘅嘢,再交返一個檔案。內置有三個,協定簡單到幾分鐘就寫到一個。

喺 **設定 → 擴充功能** 管理:可以搜尋、睇每個可以讀乜同可以行幾耐、開或者閂、行佢哋嘅指令,再儲存或者打開佢哋交出嚟嘅嘢。

- **內置:** 「標記轉 CSV」(試算表用得,會開公式嘅字會被中和)、「標記轉 GeoJSON」(俾地圖同 GIS 工具用嘅點,x 向東、z 向南、y 係高度)、「地圖報告」(Markdown,有地圖名、id 同每組標記數量)。內置嘅一開始就開咗,但係用同一套 manifest、協定、權限同限制。
- **點寫:** 一個資料夾,入面有 `worldlens-extension.json` 同佢要行嘅程式。`run.command` 可以係 `node`(用程式自己嘅執行環境,唔使另外裝)、`python`、`python3`、`py`,或者資料夾入面嘅程式;資料夾外面嘅路徑會被拒絕。權限有 `read-markers`、`read-map-summary` 同 `produce-file`。每個指令要有 `id`、`title` 同 `input`(`none`、`markers` 或者 `map-summary`),讀標記就一定要聲明 `read-markers`。限制:時間 500 至 60,000 毫秒(預設 10,000),輸出 1 KB 至 16 MB(預設 1 MB)。
- **協定:** 每次行指令,Worldlens 喺佢嘅資料夾開個程式,喺標準輸入寫一行 JSON 再關閉;程式喺標準輸出寫一行 JSON 就完。成功係 `{"ok":true,...}`,失敗係 `{"ok":false,"message":"..."}`。標準錯誤會保留(最多 64 KB),顯示喺結果下面,用嚟除錯。
- **範例:** 程式庫入面 `docs/extensions-samples/` 有兩個完整範例:Python 嘅「數標記」同 JavaScript 嘅「標記按高度排」。用「加一個擴充功能資料夾」安裝,打開,開張地圖再行指令就得;唔開程式都可以直接將要求 pipe 入去試。
- **權限同同意:** 你加嘅一律閂住,打開嗰陣會列清楚佢可以讀乜,問你同唔同意。Worldlens 記住你同意咗嘅權限;更新之後權限變咗,就會自動閂返再問過。
- **安全:** 擴充功能係用你嘅權限喺呢部電腦行嘅程式,只加你信得過嘅。一次一個要求,喺自己嘅程序入面行,超時或者輸出太大就會被停。佢只會收到指令聲明嘅輸入;環境變數淨低開程式需要嘅幾個,權杖同鎖匙一律唔會傳過去。寄存工作區唔會幫訪客開程式,所以唔支援擴充功能。
- **驗證:** 上面列出嘅三個測試檔:manifest 逐個問題講出嚟、三個內置真係行到、權限變咗會再問、秘密環境變數同冇聲明嘅輸入唔會去到程式、時間同大細限制會停程式、資料夾外嘅程式會被拒絕;兩個範例經同一個 host 真係行過。
