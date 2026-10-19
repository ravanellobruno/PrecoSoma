import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { listFinishedPurchases, type PurchaseSummary } from '@/db';
import { formatCents, formatDateTime, pluralize } from '@/lib/format';
import { colors, radius } from '@/theme';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      listFinishedPurchases(db).then(setPurchases);
    }, [db]),
  );

  return (
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
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          onPress={() => router.push(`/purchase/${item.id}`)}>
          <View style={styles.cardInfo}>
            <Text style={styles.date}>{formatDateTime(item.finished_at)}</Text>
            <Text style={styles.meta}>{pluralize(item.item_count, 'item', 'itens')}</Text>
          </View>
          <Text style={styles.total}>{formatCents(item.total_cents)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  cardInfo: { flex: 1, gap: 2 },
  date: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textSecondary },
  total: { fontSize: 18, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] },
});
