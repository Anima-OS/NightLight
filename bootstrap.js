/* Copyright (c) 2018, Mark "Happy-Ferret" Bauermeister
 *
 * This software may be modified and distributed under the terms
 * of the BSD license.  See the LICENSE file for details.
 */

"use strict";

const { utils: Cu } = Components;
const { require } = Cu.import("resource://devtools/shared/Loader.jsm", {})
var { ToggleButton } = require("sdk/ui/button/toggle");

const asyncStorage = require("devtools/shared/async-storage");

// Frontend initialization.
var button = ToggleButton({
  id: "night-light",
  label: "Night Light",
  icon: "chrome://nightlight/content/moon.png",
  onClick: changed,
});

// JS CTypes initialization.
Cu.import("resource://gre/modules/ctypes.jsm")
var gdi32 = ctypes.open("gdi32.dll");
var user32 = ctypes.open("user32.dll");

var BOOL = ctypes.bool;
var HDC = ctypes.voidptr_t;
var LPVOID = ctypes.voidptr_t;
var WORD = ctypes.unsigned_short;
var PVOID = ctypes.voidptr_t;

var HANDLE = PVOID;
var HWND = HANDLE;

// Refactor into its own module.
class GammaService {
  get gammaStore() {
    return asyncStorage.getItem("gammaRamp");
  }

  set gammaStore(gammaArray) {
    asyncStorage.setItem("gammaRamp", gammaArray);
  }

  _GetDC(hwnd) {
    var GetDC = user32.declare('GetDC', ctypes.winapi_abi,
                                        HDC,    //return
                                        HWND    // hWnd
                                      );
    return GetDC(hwnd)
  }

  _GetDeviceGammaRamp(hdc, lpRamp) {
    var GetDeviceGammaRamp = gdi32.declare("GetDeviceGammaRamp", ctypes.winapi_abi,
                                                                 BOOL,    // return
                                                                 HDC,     // hDC
                                                                 LPVOID   // lpRamp
                                                                );
    return GetDeviceGammaRamp(hdc, lpRamp)
  }

  _SetDeviceGammaRamp(hdc, lpRamp) {
    var SetDeviceGammaRamp = gdi32.declare("SetDeviceGammaRamp", ctypes.winapi_abi,
                                                                 BOOL,    // return
                                                                 HDC,     // hDC
                                                                 LPVOID   // lpRamp
                                                                );
    return SetDeviceGammaRamp(hdc, lpRamp)
  }
}

var gammaService = new GammaService();

var hdc = gammaService._GetDC(null);
var buf = WORD.array((256) * 3)(); // 3 arrays of 256 WORD elements each.
var lpGamma = buf.address(); // Copy of initial buffer.

function changed(state) {
  if (state.checked) {
    button.icon = "chrome://nightlight/content/sun.png";
    button.label = "Normal Mode";
    setGamma(0.8)
  }
  else {
    button.icon = "chrome://nightlight/content/moon.png";
    button.label = "Night Light";
    setGamma(1.1)
  }
}

async function install() {
  // Save currently set GammaRamp as default.
  gammaService._GetDeviceGammaRamp(hdc, lpGamma);

  var store = await gammaService.gammaStore;
    if (store == null) {
      for (var i = 0; i < 768; i++) {
        var previous = await gammaService.gammaStore;
        if (previous == null) {
          asyncStorage.setItem("gammaRamp", buf[i])
        }
        else {
          asyncStorage.setItem("gammaRamp", previous + "," + buf[i])
        }
      }
    }
    console.log(store.split(",").map(Number));
}

async function uninstall() {
  button.destroy()

  // Reset GammaRamp to default values upon uninstall.
  var store = await gammaService.gammaStore;
  buf = WORD.array((256) * 3)(store.split(",").map(Number));
  gammaService._SetDeviceGammaRamp(hdc, buf.address());
}

async function setGamma(intensity) {
  var isOk = gammaService._GetDeviceGammaRamp(hdc, buf.address());

  if (isOk) {
    /// Night Light: Reduce blue.
    if (intensity == 0.8) {
      for (var i = 512; i < 768; i++) {
        var buffer = buf[i] * intensity;
        buf[i] = Math.round(buffer);
      }
      gammaService._SetDeviceGammaRamp(hdc, buf.address());
    }

    // Normal Mode: Return to default gamma.
    if (intensity == 1.1) {
      var store = await gammaService.gammaStore;
      buf = WORD.array((256) * 3)(store.split(",").map(Number));
      gammaService._SetDeviceGammaRamp(hdc, buf.address())
    }
  } else {
    console.log('failed');
  }
}

function shutdown() {
  button.destroy()
}

function startup() { }
function update() { }