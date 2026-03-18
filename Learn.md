# ScritHTML v2.0-pragmatic ガイド

ScritHTML は、HTML に直接リアクティブなUIを構築するための JavaScript ライブラリです。ビルドステップを必要とせず、HTML のような構文を使用して、動的なウェブアプリケーションを簡単に作成できます。

## 目次

1.  [はじめに](#はじめに)
2.  [リアクティビティの基本](#リアクティビティの基本)
    -   [リアクティブな変数](#リアクティブな変数)
    -   [式](#式)
3.  [コントロールフロー](#コントロールフロー)
    -   [条件付きレンダリング](#条件付きレンダリング)
    -   [リストレンダリング](#リストレンダリング)
    -   [スイッチ](#スイッチ)
4.  [非同期処理](#非同期処理)
5.  [コンポーネントシステム](#コンポーネントシステム)
    -   [コンポーネントの定義](#コンポーネントの定義)
    -   [スロット](#スロット)
6.  [状態管理](#状態管理)
    -   [ローカル状態](#ローカル状態)
    -   [共有ストア](#共有ストア)
    -   [状態ブロック](#状態ブロック)
7.  [イベントハンドリング](#イベントハンドリング)
8.  [属性とスタイルのバインディング](#属性とスタイルのバインディング)
9.  [高度な機能](#高度な機能)
    -   [メモ化](#メモ化)
    -   [ディレクティブ](#ディレクティブ)

---

## はじめに

ScritHTML を使用するには、`scrit.js` ファイルを HTML に含めるだけです。

```html
<!DOCTYPE html>
<html>
<head>
  <title>ScritHTML Demo</title>

  <script src="scrit.js"></script>
</head>
<body>
  <script type="text/scrit">
  <!-- ScritHTML コードはここに記述します -->
  <$message>Hello, ScritHTML!</$message>

  <h1>{ message }</h1>
</script>
</body>
</html>
```

ScritHTML は、ページの読み込み時に自動的に起動し、body 内の特別なタグを解釈して実行します。また、`<script type="text/scrit">` タグ内にコードを記述することもできます。

---

## リアクティビティの基本

### リアクティブな変数

ScritHTML の中心的な機能はリアクティビティです。`<$name>` タグを使用して、値が変更されると UI が自動的に更新されるリアクティブな変数を定義できます。

```html
<!-- 変数の定義 -->
<$count>0</$count>

<p>Count: { count }</p>
```

### 式

波括弧 `{}` を使用して、HTML 内に JavaScript の式を埋め込むことができます。これらの式はリアクティブであり、依存する変数が変更されると自動的に再評価されます。

```html
<$price>100</$price>
<$quantity>2</$quantity>

<p>Total: { price * quantity }</p>
```

---

## コントロールフロー

### 条件付きレンダリング

`<if>` タグまたは `s-if` 属性を使用して、コンテンツを条件付きでレンダリングできます。

**`<if>` タグ:**

```html
<$loggedIn>false</$loggedIn>

<if rev="{loggedIn}">
  <p>ようこそ！</p>
  <else>
  <p>ログインしてください。</p>
  </else>
</if>
```

**`s-if` 属性:**

`s-if` は、単一の要素に適用する場合に便利です。

```html
<p s-if="{showDetails}">詳細情報はこちらです。</p>
```

### リストレンダリング

`<for>` タグまたは `s-for` 属性を使用して、配列の各アイテムをレンダリングします。

**`<for>` タグ:**

```html
<s-state>
  { items: ['Apple', 'Banana', 'Cherry'] }
</s-state>

<ul>
  <for @each="<item in=<items/>>">
    <li>{ item }</li>
  </for>
</ul>
```

**`s-for` 属性:**

```html
<ul>
  <li s-for="item in items">{ item }</li>
</ul>
```

### スイッチ

`<switch>` タグを使用して、複数の条件に基づいてコンテンツを切り替えます。

```html
<$status>'pending'</$status>

<switch>
  <case when="{status === 'pending'}">
    <p>Loading...</p>
  </case>
  <case when="{status === 'success'}">
    <p>Success!</p>
  </case>
  <default>
    <p>An error occurred.</p>
  </default>
</switch>
```

---

## 非同期処理

`<await>` タグを使用して、Promise の解決をエレガントに処理します。

```html
<s-state>
{
  userPromise: fetch('https://api.example.com/user').then(res => res.json())
}
</s-state>

<await rev="{userPromise}">
  <pending>
    <p>Fetching user...</p>
  </pending>
  <then>
    <p>Welcome, { data.name }</p>
  </then>
  <catch>
    <p>Failed to fetch user: { error.message }</p>
  </catch>
</await>
```

---

## コンポーネントシステム

### コンポーネントの定義

`<component>` タグを使用して、再利用可能な UI の部品を定義します。

```html
<component name="UserProfile">
  <div>
    <h3>{ name }</h3>
    <p>{ email }</p>
    <slot></slot> <!-- 子要素はここに挿入されます -->
  </div>
</component>

<!-- コンポーネントの使用 -->
<UserProfile name="John Doe" email="john@example.com">
  <p>This is a bio.</p>
</UserProfile>
```

### スロット

`<slot>` タグは、コンポーネントが呼び出されるときに渡された子要素のプレースホルダーとして機能します。

---

## 状態管理

### ローカル状態

`<$name>` タグで定義された変数は、そのスコープ内でローカルです。

### 共有ストア

`<store>` タグを使用して、アプリケーションの複数の部分で共有できるグローバルな状態ストアを作成します。

```html
<store name="cart">
  <value name="items">[]</value>
  <value name="total">0</value>
</store>

<!-- 他の場所からアクセス -->
<p>Cart Items: { cart.items.length }</p>
```

### 状態ブロック

`<s-state>` (または `<script type="scrit/state">`) ブロックを使用すると、複数のリアクティブ変数を JavaScript オブジェクトとしてまとめて定義できます。

```html
<s-state>
{
  count: 0,
  message: 'Hello',
  user: { name: 'Guest', loggedIn: false }
}
</s-state>

<p>{ message }, { user.name }!</p>
<p>Count: { count }</p>
```

このブロック内のプロパティは自動的にリアクティブな状態（シグナルまたはリアクティブオブジェクト）に変換されます。

---

## イベントハンドリング

`@` プレフィックスを使用して、DOM イベントをリッスンします。

```html
<$count>0</$count>

<!-- インラインでロジックを記述 -->
<button @click="count++">Increment</button>

<!-- 複数の操作 -->
<button @click="console.log('Clicked'); count = 0;">Reset</button>

<!-- $event オブジェクトにアクセス -->
<input @input="console.log($event.target.value)" />
```

より複雑なロジックは `<event>` タグでカプセル化することもできます。

```html
<button>
  Click me
  <event name="click">
    console.log('Button was clicked!');
    <$count>++</$count>
  </event>
</button>
```

---

## 属性とスタイルのバインディング

`:` プレフィックスを使用して、HTML 属性をリアクティブなデータにバインドします。

```html
<$imageUrl>'logo.png'</$imageUrl>
<$isActive>true</$isActive>
<$textColor>'red'</$textColor>

<!-- 動的属性 -->
<img :src="{imageUrl}" alt="Logo">

<!-- 動的クラス -->
<div class="static" :class="{ 'active': isActive }"></div>
<!-- 結果: <div class="static active"></div> -->

<!-- 動的スタイル -->
<p :style="{ color: textColor, fontSize: '16px' }">Red text</p>

<!-- リアクティブな <style> タグ -->
<style>
  .highlight {
    color: {textColor};
    font-weight: bold;
  }
</style>
```

---

## 高度な機能

### メモ化

`<memo>` を使用して、計算コストの高い派生状態をキャッシュします。計算は、その依存関係が変更されたときにのみ再実行されます。

```html
<$firstName>'John'</$firstName>
<$lastName>'Doe'</$lastName>

<memo name="fullName" rev="{firstName + ' ' + lastName}" />

<p>Full Name: { fullName }</p>
```

### ディレクティブ

`use:name` 構文を使用して、要素にカスタム動作を追加します。

```html
<!-- `focus` はデフォルトのディレクティブです -->
<input use:focus />

<!-- カスタムディレクティブ -->
<div use:highlight="'yellow'">This will be highlighted.</div>
```

ScritHTML には `highlight`、`tooltip`、`focus` などの組み込みディレクティブが含まれています。

```javascript
// カスタムディреクティブの登録 (JS内)
Scrit.run(...).directives['my-directive'] = (el, value) => {
  // el: 要素
  // value: ディレクティブに渡された値
};
```
