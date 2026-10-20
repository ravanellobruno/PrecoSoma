import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EditItemModal } from '@/components/edit-item-modal';
import { ItemRow } from '@/components/item-row';
import {
  deleteItem,
  deletePurchase,
  getPurchase,
  listItems,
  totalCents,
  updateItem,
  type Item,
} from '@/db';
import { formatCents, formatDateTime, pluralize } from '@/lib/format';
import { colors, radius } from '@/theme';

export default function PurchaseDetailScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const purchaseId = Number(useLocalSearchParams<{ id: string }>().id);

  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const purchase = await getPurchase(db, purchaseId);
    setFinishedAt(purchase?.finished_at ?? null);
    setItems(await listItems(db, purchaseId));
  }, [db, purchaseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSave(changes: {
    description: string | null;
    priceCents: number;
    quantity: number;
  }) {
    if (!editing) return;
    await updateItem(db, editing.id, changes);
    setEditing(null);
    await load();
  }

  function handleDeleteItem(item: Item) {
    Alert.alert('Remover item?', item.description ?? undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await deleteItem(db, item.id);
          await load();
        },
      },
    ]);
  }

  function handleDelete() {
    Alert.alert('Excluir compra?', 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deletePurchase(db, purchaseId);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: finishedAt ? formatDateTime(finishedAt) : 'Compra' }} />

      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total da compra</Text>
            <Text style={styles.totalValue} adjustsFontSizeToFit numberOfLines={1}>
              {formatCents(totalCents(items))}
            </Text>
            <Text style={styles.totalLabel}>{pluralize(items.length, 'item', 'itens')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            onEdit={() => setEditing(item)}
            onDelete={() => handleDeleteItem(item)}
          />
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label="Excluir compra" variant="danger" onPress={handleDelete} />
      </View>

      {editing && (
        <EditItemModal item={editing} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  totalCard: {
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
    gap: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  totalLabel: { fontSize: 14, color: colors.textSecondary },
  totalValue: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
