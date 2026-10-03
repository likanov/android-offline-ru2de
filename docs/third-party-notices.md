# Third-party components

Versions below were read from the installed, lockfile-pinned dependencies on
4 October 2026. Local upstream license/attribution texts are in `licenses/` and
are included in the candidate bundle. No private signing key, model download
address, connection string or token is included in the installer materials.

| Component | Actual version / revision | License / material |
| --- | --- | --- |
| React | 19.2.3 | MIT, `licenses/react-LICENSE.txt` |
| React Native (Hermes/New Architecture) | 0.85.3 | MIT, `licenses/react-native-LICENSE.txt`; upstream native notices apply |
| Expo | 56.0.23 | MIT, `licenses/expo-LICENSE.txt` |
| expo-asset | 56.0.25 | MIT, `licenses/expo-asset-LICENSE.txt` |
| expo-audio | 56.0.13 | MIT, `licenses/expo-audio-LICENSE.txt` |
| expo-crypto | 56.0.5 | MIT, `licenses/expo-crypto-LICENSE.txt` |
| expo-document-picker | 56.0.4 | MIT, `licenses/expo-document-picker-LICENSE.txt` |
| expo-notifications | 56.0.26 | MIT, `licenses/expo-notifications-LICENSE.txt` |
| expo-sqlite | 56.0.6 | MIT, `licenses/expo-sqlite-LICENSE.txt`; SQLite upstream public-domain code |
| llama.rn | 0.12.9 | MIT, `licenses/llama.rn-LICENSE.txt` |
| llama.cpp runtime sources vendored by llama.rn | pinned in llama.rn 0.12.9 | MIT, `licenses/llama.cpp-LICENSE.txt` |
| Qwen3-1.7B weights | source revision `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e` | Apache-2.0, `licenses/Qwen3-1.7B-LICENSE.txt` |
| German Thorsten voice dataset | `de_DE-thorsten-medium` | CC0, `licenses/thorsten-MODEL_CARD.txt` |
| Piper development generator | 1.3.0 | GPL-3.0; generator/voice weights are outside the APK and bundle |
| llama.cpp conversion/quantization tool | b10256, `6c8dcaa7ae41fa9f4aa2b3b68ee82cb8b2a03632` | MIT; development tool outside APK/bundle |

The bundled model is a locally converted and quantized Q4_K_M derivative of
Qwen3-1.7B. Size, hash and source revision are in `model/model-manifest.json`.
The 40 supplied pronunciation recordings were generated locally; exact texts,
generator/voice provenance and hashes are in `audio/manifest.json`. Their content
comes from the user's supplied vocabulary material. The project includes no
cloud model runtime or Piper executable.

`licenses/npm-production-inventory.json` retains package names, actual versions
and license metadata from package-lock.json for production dependency entries.
`licenses/npm-production-notices.txt` retains available local LICENSE/NOTICE
texts from those entries, including transitive packages. Some packages are build
support rather than runtime content. This inventory does not replace an Android
native dependency attribution audit; that audit remains a documented release
limitation before any broader distribution. This task creates a personal local
candidate, with no app-store publication.
