import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";

@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div
        id="page-play"
        class="flex flex-col items-center justify-center min-h-[80vh] w-full px-4 lg:px-0 gap-6 select-none"
      >
        <token-login class="absolute"></token-login>

        <!-- Premium Strategy Game Hub Card -->
        <div
          class="w-full max-w-lg bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/80 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_30px_rgba(234,179,8,0.05)] p-8 flex flex-col gap-6 transition-all duration-300 hover:border-amber-500/20"
        >
          <!-- Logo & Title Section -->
          <div class="flex flex-col items-center gap-3">
            <img
              src=${assetUrl("images/OpenFrontLogo.svg")}
              alt="Fetih Online"
              class="h-16 w-auto drop-shadow-[0_0_10px_rgba(0,132,209,0.3)]"
            />
            <h1
              class="text-3xl font-black text-center tracking-widest bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent uppercase drop-shadow-[0_0_15px_rgba(245,158,11,0.2)]"
              style="font-family: 'OpenFront', sans-serif;"
            >
              Fetih Online
            </h1>
            <p
              class="text-xs text-zinc-500 tracking-wider uppercase font-semibold"
            >
              Cihan Hâkimiyeti Mücadelesi
            </p>
          </div>

          <!-- Divider -->
          <div
            class="h-px w-full bg-gradient-to-r from-transparent via-zinc-800 to-transparent"
          ></div>

          <!-- Play Configuration (Username, Skin, Flag) -->
          <div class="flex flex-col gap-4">
            <!-- Username Input -->
            <div class="flex flex-col gap-2">
              <label
                class="text-xs font-bold text-zinc-400 uppercase tracking-widest"
                >Kullanıcı Adı</label
              >
              <username-input class="w-full h-12"></username-input>
            </div>

            <!-- Customization Row (Skin & Flag) -->
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-2">
                <label
                  class="text-xs font-bold text-zinc-400 uppercase tracking-widest"
                  >Görünüm (Skin)</label
                >
                <pattern-input
                  id="pattern-input-desktop"
                  show-select-label
                  class="w-full h-12"
                ></pattern-input>
              </div>
              <div class="flex flex-col gap-2">
                <label
                  class="text-xs font-bold text-zinc-400 uppercase tracking-widest"
                  >Bayrak</label
                >
                <flag-input
                  id="flag-input-desktop"
                  show-select-label
                  class="w-full h-12"
                ></flag-input>
              </div>
            </div>
          </div>

          <!-- Divider -->
          <div
            class="h-px w-full bg-gradient-to-r from-transparent via-zinc-800 to-transparent"
          ></div>

          <!-- Game Modes & Play Button -->
          <game-mode-selector class="w-full"></game-mode-selector>
        </div>
      </div>
    `;
  }
}
