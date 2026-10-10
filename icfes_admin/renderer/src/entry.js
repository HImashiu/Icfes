// The admin page uses the student app's own renderer, so previews match what students see.
import { renderRich, plainText } from "./render.js";

window.renderRich = renderRich;
window.plainText = plainText;
