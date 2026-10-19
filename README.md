# PreçoSoma

App mobile (Expo / React Native) para somar os preços dos produtos durante as compras no supermercado.
100% offline: todos os dados ficam em um banco SQLite no próprio aparelho (`expo-sqlite`).

## Rodar

```bash
npm install
npx expo start      # abra no Expo Go (iOS/Android) ou use `npm run ios` / `npm run android`
```

## Estrutura

- `src/app/index.tsx` — compra atual: total em tempo real, lista de itens, formulário (preço, quantidade, descrição opcional) e "Finalizar".
- `src/app/history.tsx` — compras finalizadas, com data e total.
- `src/app/purchase/[id].tsx` — detalhe de uma compra do histórico (e exclusão).
- `src/db/index.ts` — schema (migração via `PRAGMA user_version`) e todas as consultas.
- `src/lib/format.ts` — formatação de moeda (R$) e datas.

Valores são guardados em centavos (inteiros) para evitar erros de ponto flutuante.
