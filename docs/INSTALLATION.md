# Installation details

## Multiple printers

The installer discovers Moonraker instances on the same host and asks which ones to set up. Each selected instance gets its own Voyager address. It cannot configure Moonraker on another computer for you.


The arrow next to the printer name in the top bar opens the printer list. Add each printer with a nickname and its address, then switch between them from the same page. The address is the printer's IP or hostname, with a port when Moonraker is not behind a web server on port 80 (Moonraker's own port is usually `7125`). This also covers a Moonraker on a non-standard port.

Each printer has to allow the page's address in `moonraker.conf`, otherwise the browser is not let in:

```ini
[authorization]
cors_domains:
    http://192.168.1.10:1977
```

Use the address you open Voyager UI with. Saved printers are kept in the browser and shared through the printer settings, so other browsers can pick up the same list. Dashboard layouts and other settings stay on each printer.

With more than one printer in the list, the same menu has All printers: one card per printer with its state, progress, temperatures and a camera snapshot.


## Installer behaviour and options

The installer  checks the system first, finds every printer on the host, asks which ones to set up, picks a free port for each, checks the download against the SHA256 published with the release, writes an nginx site (the /webcam/ addresses lead to the same cameras as in Mainsail or Fluidd) and adds an `[update_manager voyager-ui]` section to `moonraker.conf`. If your network is not in `trusted_clients` it asks whether to add it (default no, then the UI asks for a Moonraker login). It only replaces a folder it installed itself, never a git clone or a folder of yours with the same name. Options:

```
--port 8001              use this port
--printer printer_data_2 only this printer (or: all)
--moonraker-port 7126    if it cannot find it
--check                  only run the system check
--no-updater             skip the update_manager section
--yes                    take every suggested answer
--zip voyager-ui.zip     install from a downloaded release (offline, or to roll back)
--uninstall              remove files, nginx site, update_manager section and the trusted_clients entry it added. Settings stay in the Moonraker database
```

Moonraker with `force_logins` or an address outside `trusted_clients`: the UI asks for your Moonraker user name and password. This was tested against a simulated Moonraker, not a real one yet, so reports are welcome.

Not supported yet: Creality K1, Sonic Pad and other OpenWrt hosts.
