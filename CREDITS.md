# macintosh.js Credits

This app by <a href="https://www.felixrieseberg.com">Felix Rieseberg</a>. The real work was done by the people below:

**Emulator**: Basilisk II, a 68k Macintosh emulator, by [Christian Bauer et al](http://basilisk.cebix.net). The WebAssembly build, the JavaScript ↔ emulator bridge (input, video, audio, disk, ethernet), and the ADB key-code tables come from [**Infinite Mac**](https://infinitemac.org) by [Mihai Parparita](https://github.com/mihaip/infinite-mac), which extends the original [Emscripten port](https://jamesfriend.com.au/basilisk-ii-classic-mac-emulator-in-the-browser) by [James Friend](https://jamesfriend.com.au). Huge thanks to Mihai — go play with Infinite Mac, it's wonderful.

**Runtime**: The developers behind Electron, electron-forge, Chromium, Node.js.

**Installed software** from vintage computing archives: [WinWorldPC](https://winworldpc.com), [Macintosh Garden](https://macintoshgarden.org), and [Macintosh Repository](https://www.macintoshrepository.org/).

This software is not affiliated with nor authorized by Apple. It is provided for educational purposes only. This is an unstable toy and should not be expected to work properly.

# Licenses

The [source code for this app can be found on GitHub](https://github.com/felixrieseberg/macintosh).

Basilisk II and its components are released under the GNU GPL. See [LICENSE](src/basilisk/LICENSE.txt) for details. The Infinite Mac WebAssembly build and adapted bridge code are licensed under the Apache License 2.0; see [LICENSE-infinite-mac](src/basilisk/LICENSE-infinite-mac).
