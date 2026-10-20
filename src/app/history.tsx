import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { EmptyState } from '@/components/empty-state';
import { deletePurchases, listFinishedPurchases, type PurchaseSummary } from '@/db';
import { formatCents, formatDateTime, pluralize } from '@/lib/format';
import { colors, radius } from '@/theme';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  const load = useCallback(async () => {
    const list = await listFinishedPurchases(db);
    setPurchases(list);
    // Drop selections of purchases that no longer exist (e.g. deleted from their own screen).
    setSelected((ids) => ids.filter((id) => list.some((p) => p.id === id)));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const allSelected = purchases.length > 0 && selected.length === purchases.length;

  function toggle(id: number) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  function toggleAll() {
    setSelected(allSelected ? [] : purchases.map((p) => p.id));
  }

  function handleDeleteSelected() {
    const count = pluralize(selected.length, 'compra', 'compras');
    Alert.alert(`Excluir ${count}?`, 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deletePurchases(db, selected);
          setSelected([]);
          await load();
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      {purchases.length > 0 && (
        <View style={styles.selectBar}>
          <Checkbox
            label="Selecionar todas as compras"
            checked={allSelected ? true : selected.length > 0 ? 'mixed' : false}
            onPress={toggleAll}
          />
          <Pressable accessibilityRole="button" onPress={toggleAll} style={styles.selectLabel}>
            <Text style={styles.selectText}>Selecionar todos</Text>
          </Pressable>
          {selected.length > 0 && (
            <Text style={styles.selectCount}>
              {pluralize(selected.length, 'selecionada', 'selecionadas')}
            </Text>
          )}
        </View>
      )}

      <FlatList
        contentContainerStyle={purchases.length === 0 ? styles.emptyList : styles.list}
        data={purchases}
        keyExtractor={(p) => String(p.id)}
        ListEmptyComponent={
          <EmptyState
            title="Nenhuma compra finalizada"
            hint="As compras finalizadas aparecem aqui com a data."
          />
        }
        renderItem={({ item }) => {
          const checked = selected.includes(item.id);
          return (
            <View style={[styles.card, checked && styles.cardChecked]}>
              <Checkbox
                label={`Selecionar compra de ${formatDateTime(item.finished_at)}`}
                checked={checked}
                onPress={() => toggle(item.id)}
              />
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
                onPress={() => router.push(`/purchase/${item.id}`)}>
                <View style={styles.cardInfo}>
                  <Text style={styles.date}>{formatDateTime(item.finished_at)}</Text>
                  <Text style={styles.meta}>{pluralize(item.item_count, 'item', 'itens')}</Text>
                </View>
                <Text style={styles.total}>{formatCents(item.total_cents)}</Text>
              </Pressable>
            </View>
          );
        }}
      />

      {selected.length > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            label={`Excluir ${pluralize(selected.length, 'compra', 'compras')}`}
            variant="danger"
            onPress={handleDeleteSelected}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingTop: 12,
    paddingBottom: 4,
  },
  selectLabel: { flex: 1 },
  selectText: { fontSize: 16, fontWeight: '500', color: colors.text },
  selectCount: { fontSize: 14, color: colors.textSecondary },
  list: { padding: 16, gap: 10 },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardChecked: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  pressed: { opacity: 0.7 },
  cardInfo: { flex: 1, gap: 2 },
  date: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textSecondary },
  total: { fontSize: 18, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
