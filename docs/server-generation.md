# Generating a world and project from a server

**Generate and start project** creates a local Java server, lets it generate a fresh world, inspects
the real world folder and writes a durable project for it, then opens the World screen. One
coordinator in the main process owns the whole lifecycle; the dialog on Projects, Home and World
only shows its state.

## Behaviour

The dialog collects a project name, edition and flavour (vanilla, Paper, Purpur or Spigot), a
catalogue version, a seed kept as text, a world name, memory and port, download consent and the
explicit EULA acceptance. Submitting it sends one request with an operation id. The coordinator then
moves through named stages: creating the server, generating, inspecting, creating the project,
complete. Interrupted, failed and cancelled are separate terminal stages, each with a message.

Progress reaches the dialog through a push event scoped to the window that started the operation.
Re-opening the dialog reads the saved state of the operation back, so a closed dialog never loses a
running generation, and the same operation id is idempotent: a repeated request returns the retained
record instead of starting a second server.

Capability descriptors are read from the selected server's own data-generator report when one is
available. Each descriptor carries its type, default, bounds and an availability reason, so the
dialog renders a control only for a setting the server actually declares. Protected inputs such as
the RCON password, management secret, level name and port are refused from the renderer; the
coordinator owns them.

Cancel requests a safe stop and reports what already happened. It never claims rollback because the
dialog closed, and recoverable output stays on disk for inspection.

## Configuration

Operation records live under `generation-operations` and acquired reports under
`generation-reports` in the app data folder. Generated projects are written beside the world with
the id `generated-<operation id>` and the server's id recorded, which is what later lets a render
of that world resolve back to its server.

Server properties supplied with the request are merged over the server's own `server.properties`
after creation; the protected keys above are never accepted from the request.

## Failure modes

- A request with an unknown field, an invalid id, a protected property or an oversized payload is
  refused as invalid before any server is created.
- A failure inside the operation returns a generic failure and keeps the retained server and
  operation records for recovery; the message says so.
- If a different project already exists in the generated world folder, project creation stops with
  a destination-exists failure and offers retrying project creation against the verified output.
- The data-generator report for a flavour or version that does not provide one leaves the
  capability list empty and the dialog says the inventory is unavailable rather than inventing one.

## Security considerations

Only the application's own main frame may invoke the generation channels. The renderer never
supplies file-system roots, service functions or registry records. EULA acceptance is an explicit
boolean in the request and is recorded by the server creation path that already owns it; nothing
here accepts the EULA on a person's behalf.

## Verification

Focused generation and collection checks pass against the current source, including coordinator,
registrar, capability, protected-field and lifecycle checks. The scoped backend source typecheck
passes. A full package typecheck still requires built workspace declarations; this lane did not
run a competing root build. The registrar is wired into the main entry beside the server registry. Not verified
here: an actual generation run against a downloaded server jar, Bedrock or non-vanilla inventories,
and the packaged Windows dialog.

## Sources and suggested articles

- `design/packages/app/src/main/mcserver/generation/coordinator.ts`
- `design/packages/app/src/main/mcserver/generation/register.ts`
- `design/packages/ui/src/components/mcserver/GenerationProjectDialog.vue`
- [Creating Minecraft servers](./mcserver-hosting.md), [Server configuration editor](./server-configuration-editor.md)

## Recovery and identity checks

Reopening an active operation restores observation, locks the submitted inputs and leaves safe
cancellation available. Concurrent submissions cannot create duplicate servers. A resumed operation
checks its retained server registry identity and runtime. Changed name, port, version, seed or
other submitted settings require a new operation id.

Completion requires an inspected level.dat and region files, the exact generated project id,
the recorded server id and map world paths matching the generated folder. A project-readback
failure retains the generated folder, so a retry reaches project creation without generating a
second world. Completed operations repeat world and project readback before opening. Cancellation
after inspection stops before project creation; cancellation never deletes generated files.

Seed text never passes through a JavaScript number. Nonzero signed Java long seeds are compared
with the saved level.dat value after the server exits; zero, empty and nonnumeric seeds retain
the server's own semantics. Level name, seed and server port use the dedicated dialog inputs;
capability controls cannot override them. Numeric capability values obey the reported bounds.

## 廣東話

重新開啟進行中的操作會恢復狀態觀察，鎖定已提交的設定，並保留安全取消按鈕。
同時提交同一操作不會建立第二個伺服器。繼續操作前會核對已保存的伺服器身份及執行設定；
名稱、連接埠、版本、種子或其他設定改變時，必須新增操作。

完成前必須讀到 level.dat 及區域檔案，並核對專案身份、伺服器身份及所有地圖世界路徑。
專案讀回失敗會保留已生成的世界，重試只會繼續建立專案。完成的操作亦會再次讀回核對。
檢查世界後收到取消要求，會在建立專案前停止；取消不會刪除已生成的檔案。

種子以完整文字傳送，非零 Java 有號長整數會與儲存後的 level.dat 核對，避免精度流失。
零、空白及文字種子保留伺服器本身的處理方式。世界名稱、種子及連接埠由專用欄位管理，
其他產生選項不能覆寫；數值選項亦必須符合來源限制。下載後的伺服器實際生成、EULA 同意、
原生 Windows 介面及完整版本組合仍需另行驗證，單元測試不代表已完成這些驗收。
