# PreçoSoma

App mobile (Expo / React Native) para somar os preços dos produtos durante as compras no supermercado.
100% offline: todos os dados ficam em um banco SQLite no próprio aparelho (`expo-sqlite`).

## Rodar

```bash
npm install
npx expo run:ios      # ou: npx expo run:android
```

A leitura de preço pela câmera usa o ML Kit (OCR no aparelho), que não vem no Expo Go: é preciso
um development build (`npx expo run:ios|android` ou `eas build --profile development`). Depois do
primeiro build, `npx expo start` basta enquanto nenhuma dependência nativa mudar.

## Estrutura

- `src/app/index.tsx` — compra atual: total em tempo real, lista de itens, formulário (preço, quantidade, descrição opcional) e "Finalizar".
- `src/app/history.tsx` — compras finalizadas, com data e total.
- `src/app/purchase/[id].tsx` — detalhe de uma compra do histórico (e exclusão).
- `src/app/scan.tsx` — câmera: fotografa a etiqueta, lê os textos (OCR) e pede para confirmar o preço.
- `src/lib/price-tag.ts` — escolhe o preço entre os números da etiqueta (preço anterior, promocional, clube, por kg, código de barras, datas).
- `src/db/index.ts` — schema (migração via `PRAGMA user_version`) e todas as consultas.
- `src/lib/format.ts` — formatação de moeda (R$) e datas.

Valores são guardados em centavos (inteiros) para evitar erros de ponto flutuante.
