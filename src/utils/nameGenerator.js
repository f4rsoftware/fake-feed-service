import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let names = [];

// TXT dosyasını yükle
function loadNames() {
  if (names.length === 0) {
    const filePath = path.join(__dirname, "../config/names.txt");
    const data = fs.readFileSync(filePath, "utf-8");
    names = data
      .split("\n")             // satır satır ayır
      .map(n => n.trim())      // boşlukları temizle
      .filter(n => n.length);  // boş satırları at
  }
  return names;
}

// Rastgele bir isim seç
export function getRandomName() {
  const allNames = loadNames();
  const index = Math.floor(Math.random() * allNames.length);
  return allNames[index];
}
