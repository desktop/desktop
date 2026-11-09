# Remaining migration work

The Termux target is the headless Rust core, CLI and localhost/WebSocket base.
The original Electron implementation remains until the relevant behavior has
been replaced and verified. Items below are open work, not completed features.

## Core and CLI

- [ ] Complete publication: push the default and current branches with the
      verified account, durable phase records and explicit recovery. Preserve
      detached and unborn behavior and never replay an uncertain mutation.
- [ ] Complete publication push support for Git LFS and automatic upstream
      configuration. The unfinished push implementation was set aside after it
      caused a stack overflow on Termux; the stable core does not include it.
- [ ] Add explicit reconciliation for uncertain publication phases and older
      receipts that do not contain enough verified identity to resume.
- [ ] Support selected-account credentials for clone, new worktrees and
      submodules without borrowing a different repository's account.
- [ ] Complete authentication, account import and remaining Git/GitHub
      workflows, and compare their behavior with the legacy implementation.
- [ ] Finish the remaining core and transport items in [MIGRATION.md](MIGRATION.md)
      and remove the corresponding legacy code only after its replacement passes.

## Environment and later platforms

- [ ] Validate Windows and other native platforms and implement equivalent
      filesystem identity and safe configuration checks. These are not proven
      on the current Termux device.
- [ ] Replace the conservative publication requirement for
      `GIT_CONFIG_NOSYSTEM=1` or an explicitly specified safe system config
      with portable, verified system-configuration discovery.
- [ ] Implement and validate the Tao/Wry desktop shell later, on a suitable
      graphical platform. The browser via localhost remains the Termux route.
- [ ] Complete packaging, installers and release workflows after the relevant
      platform implementations are available.
