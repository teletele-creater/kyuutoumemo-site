// 公開用の dist/ を作る（node build.js）
//
// 手元では index.html が @babel/standalone で JSX をブラウザ上で変換して動く。
// 公開版ではその変換を前もって済ませ、Babel（約3MB）と React の開発用ビルドを読み込まないようにする。
// 変換の設定は @babel/standalone が <script type="text/babel"> に使うものと同じにしてあるので、
// 変換後のコードの動き（トップレベルの const が var になる等）は手元と変わらない。

const fs = require("fs");
const path = require("path");
const Babel = require("@babel/standalone");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
// dist に入れないもの
const SKIP = new Set([
  "README.md", "dist", "docs", "node_modules", "build.js",
  "package.json", "package-lock.json",
]);

function compileJsx(src, filename) {
  return Babel.transform(src, {
    filename,
    presets: ["react", "env"],
    plugins: ["transform-class-properties", "transform-object-rest-spread", "transform-flow-strip-types"],
    compact: true,
    comments: false,
  }).code;
}

function replaceOnce(html, from, to) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`index.html に「${from.slice(0, 60)}」が ${n} 箇所あります（1箇所のはず）`);
  return html.replace(from, to);
}

function buildIndex(html) {
  html = replaceOnce(html,
    '<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>',
    '<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z" crossorigin="anonymous"></script>');
  html = replaceOnce(html,
    '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>',
    '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1" crossorigin="anonymous"></script>');
  html = html.replace(/\n\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone@[^"]+"[^>]*><\/script>/, "");
  html = html.replace("<!-- React + Babel -->", "<!-- React -->");
  const jsx = /<script type="text\/babel" src="\/([\w-]+)\.jsx(\?[^"]*)?"><\/script>/g;
  if (!jsx.test(html)) throw new Error("index.html に JSX の読み込みが見つかりません");
  html = html.replace(jsx, (_, name, q) => `<script src="/${name}.js${q || ""}"></script>`);
  if (/babel/i.test(html.replace("<!-- React -->", ""))) throw new Error("index.html に Babel が残っています");
  return html;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);
let compiled = 0;
for (const name of fs.readdirSync(ROOT)) {
  if (SKIP.has(name) || name.startsWith(".")) continue;
  const src = path.join(ROOT, name);
  if (!fs.statSync(src).isFile()) continue;
  if (name.endsWith(".jsx")) {
    const out = compileJsx(fs.readFileSync(src, "utf8"), name);
    fs.writeFileSync(path.join(DIST, name.replace(/\.jsx$/, ".js")), out);
    compiled++;
  } else if (name === "index.html") {
    fs.writeFileSync(path.join(DIST, name), buildIndex(fs.readFileSync(src, "utf8")));
  } else {
    fs.copyFileSync(src, path.join(DIST, name));
  }
}
console.log(`dist/ を作りました（JSX ${compiled} 個を変換）`);
