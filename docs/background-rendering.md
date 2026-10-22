# Closing the window during rendering

Closing the Worldlens window while a render is active hides the window and keeps its
owning process, render, logs and progress streams running. Reopen the same window from
the tray icon or the normal Worldlens shortcut. The tray's Quit action becomes available
after rendering and output verification finish. Stop the render explicitly from its
progress panel if you want it to end sooner.

If the tray is unavailable, the window is minimized instead, retaining its taskbar
entry. Local, WSL and local-container renders use the same close protection. Active SSH
render coordination also keeps the application alive.

A forced process stop, operating-system shutdown, or power interruption is different
from closing the window normally. These cannot be promised uninterrupted rendering.
Finished tiles remain on disk, and the existing interrupted-render workflow offers
recovery after Worldlens starts again.

The close handler does not cancel a render, terminate a distribution, restart the
computer, or automatically accept a download or license.
