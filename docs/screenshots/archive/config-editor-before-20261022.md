# Earlier configuration editor captures

Preserved from README at source ae1df096. The original PNG bytes and captions are unchanged. Original capture dates are not established by this archive; consult the existing capture manifest where available. These images are historical, not the current editor.

<details>
<summary><b>The options editor</b> - all eight tabs of BlueMap's own configuration</summary>

<img src="../config-screen.png" alt="The options editor as it opens: eight tabs down the side, BlueMap's own generated defaults filling the page because the throwaway capture profile has no config folder on disk, and a search across every setting" width="900">

Captured 2026-08-15 against the current build, so this is not a historical image: the generated
options inventory it shows carries all **155 settings**, including `client-decompression`.

|                                                                                                                                                                        |                                                                                                                                                      |                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="../config-tab-core.png" alt="The options editor on its Core tab, holding the settings that apply to every map rather than to one of them" width="280">                                                                  | <img src="../config-tab-maps.png" alt="The options editor on its Maps tab, with the map configurations listed down the side and the selected map's own settings beside them" width="280">                                                | <img src="../config-tab-storages.png" alt="The options editor on its Storages tab, which decides where rendered tiles are written, on disk or into a database" width="280">                         |
| Core                                                                                                                                                                   | Maps                                                                                                                                                 | Storages                                                                                                                              |
| <img src="../config-tab-web-app.png" alt="The options editor on its Web app tab, holding what a visitor to the finished map sees and where the web app is generated" width="280">                                                            | <img src="../config-tab-web-server.png" alt="The options editor on its Web server tab, holding the built-in server's port, bind address and access log" width="280">                                    | <img src="../config-tab-server-plugin.png" alt="The options editor on its Server plugin tab, holding live player markers and the settings only a server plugin ever uses" width="280">               |
| Web app                                                                                                                                                                | Web server                                                                                                                                           | Server plugin                                                                                                                         |
| <img src="../config-tab-run.png" alt="The Run tab of the options editor, showing the command-line flags a render is started with" width="280">           | <img src="../config-search.png" alt="The options editor's search, which reaches every setting on all of the tabs at once" width="280"> | <img src="../config-regex-builder.png" alt="The regex builder anchored to the options editor's search bar" width="280"> |
| Run                                                                                                                                                                    | The search across every tab                                                                                                                          | Its regex builder                                                                                                                     |
| <img src="../config-tab-history.png" alt="The History tab of the options editor, which lists the saved revisions of the open config folder" width="280"> |                                                                                                                                                      |                                                                                                                                       |
| History                                                                                                                                                                |                                                                                                                                                      |                                                                                                                                       |

Deleting a map's configuration is guarded the same way any destructive action is, and the gate
names what would actually go before it asks.

<img src="../config-delete-gate.png" alt="The confirmation that guards deleting a map's configuration, naming the file that would go, the map id whose tiles stop being served, and that already-rendered tiles are not deleted, above two key switches, a slider and an emergency exit" width="420">

These captures show the editor holding BlueMap's own generated defaults, which is what it opens
on when this machine has no config folder to carry on from - it says so in a notice across the
top. Every setting, tab and control in them is real, live and savable; what is absent is a folder
read off the machine, not the ability to write one.

</details>
