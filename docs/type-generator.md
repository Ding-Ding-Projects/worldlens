# Type generator

The **Type generator** job turns JSON, JSON Schema or a GraphQL query into typed models for every language the bundled quicktype engine supports, and edits the JSON the types come from. It lives in the Universal features tab beside Base64. Everything runs on this computer, in a Web Worker, with no network request.

## Generate

- **Input kinds:** JSON, JSON Schema and GraphQL (a schema as introspection JSON or SDL, plus a query). TypeScript input is listed but disabled, with its reason beside it: the TypeScript front end reads files through a compiler program, which a browser or renderer cannot do.
- **Live:** types regenerate shortly after typing stops. Only the newest request counts, so a slow earlier reply never overwrites a fresher one.
- **Languages and options:** the language list and every option control come from the engine's own definitions. A boolean option is a switch, a fixed set is a select, and free text appears only where the engine asks for it. Each control has an info button with the engine's description and the default, and a reset.
- **Inference switches:** enums, maps, dates and times, UUIDs, integers and booleans written as strings, merging similar classes, ignoring `$ref`, making every property optional, and alphabetizing properties.
- **Output:** syntax-coloured code with line numbers, an inferred-types inspector built from the engine's own JSON Schema output, copy, and save to a file named after the top-level type.
- **Limits:** input over 2,000,000 characters is refused with a message. Output beyond 5,000 lines is truncated in the viewer only; copy and save carry everything.

## JSON editor

A tree and a table over the same document that Generate reads. Keys, values and types are edited with typed controls. Add, duplicate, move, delete, sort keys, remove nulls, labelled undo and redo with a history list, search with the regular expression builder, open and save files (comments, trailing commas and a byte order mark are tolerated on import), and validation against an optional JSON Schema with clickable problems.

## Not built yet

TypeScript input, a JSONPath query bar, drag and drop, multiple sources, locking the current shape as a schema, and statistics are not implemented.

## Failure modes

An unreadable source shows the parser's own message in an alert and keeps the last good output hidden rather than stale. A worker that stops reports it. Nothing is uploaded and nothing is stored except the choices of language, input kind and options.

## Verification

Unit tests cover generation for seven languages, option definitions, parse and size errors, the worker protocol, editor operations with undo and redo, schema validation, and registration.

## Third-party software

quicktype-core and quicktype-graphql-input (Apache-2.0) and graphql (MIT). See `design/NOTICE`.

## 廣東話

**類型產生器**會將 JSON、JSON Schema 或者 GraphQL 查詢，變成 quicktype 引擎支援嘅每一種語言嘅類型模型，仲可以編輯佢哋嘅 JSON 來源。入口喺「通用功能」分頁，同 Base64 一齊。全部喺呢部電腦用 Web Worker 行，唔會有任何網絡請求。

**產生：** 支援 JSON、JSON Schema 同 GraphQL（結構用內省 JSON 或者 SDL，另外加查詢）。TypeScript 輸入有列出但停用，原因寫喺旁邊：佢要編譯器讀檔案，瀏覽器做唔到。打字停低陣間就會重新產生，只有最新嗰次先算。語言同每個選項都由引擎自己嘅定義嚟，開關、選單同文字欄各用啱嘅控制項，每個都有資訊掣同重設。輸入超過 2,000,000 個字元會被拒絕。

**JSON 編輯器：** 樹同表格睇同一份文件。鍵、值同類型都用有類型嘅控制項改；有加、複製、移動、刪除、鍵排序、刪走空值、有標籤嘅復原同重做、用正規表示式搜尋、開檔同儲存，仲可以用 JSON Schema 驗證，問題可以撳入去。

**未做：** TypeScript 輸入、JSONPath 查詢列、拖放、多個來源、將現有形狀鎖成 Schema 同統計。
