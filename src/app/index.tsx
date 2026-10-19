import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ItemRow } from '@/components/item-row';
import {
  addItem,
  deleteItem,
  finishPurchase,
  getCurrentPurchaseId,
  listItems,
  totalCents,
  type Item,
} from '@/db';
import { formatCents, pluralize } from '@/lib/format';
import { colors, radius } from '@/theme';

const MAX_PRICE_DIGITS = 9;
const MAX_QUANTITY = 999;

export default function CurrentPurchaseScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const [purchaseId, setPurchaseId] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const [priceCents, setPriceCents] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState('');

  const refresh = useCallback(async () => {
    const id = await getCurrentPurchaseId(db);
    setPurchaseId(id);
    setItems(id === null ? [] : await listItems(db, id));
  }, [db]);

  // Reload whenever the screen is shown (e.g. after returning from the history).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const total = totalCents(items);
  const units = items.reduce((sum, i) => sum + i.quantity, 0);
  const lineTotal = priceCents * quantity;

  async function handleAdd() {
    if (priceCents <= 0) return;
    await addItem(db, {
      description: description.trim() || null,
      priceCents,
      quantity,
    });
    setPriceCents(0);
    setQuantity(1);
    setDescription('');
    await refresh();
  }

  function handleDelete(item: Item) {
    Alert.alert('Remover item?', item.description ?? undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await deleteItem(db, item.id);
          await refresh();
        },
      },
    ]);
  }

  function handleFinish() {
    if (purchaseId === null) return;
    Alert.alert('Finalizar compra?', `Total de ${formatCents(total)} será salvo no histórico.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          await finishPurchase(db, purchaseId);
          await refresh();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.appName}>PreçoSoma</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/history')}>
          <Text style={styles.link}>Histórico</Text>
        </Pressable>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total da compra</Text>
        <Text style={styles.totalValue} adjustsFontSizeToFit numberOfLines={1}>
          {formatCents(total)}
        </Text>
        <View style={styles.totalFooter}>
          <Text style={styles.totalMeta}>
            {pluralize(items.length, 'item', 'itens')} · {pluralize(units, 'unidade', 'unidades')}
          </Text>
          <Button
            label="Finalizar"
            variant="outline"
            disabled={items.length === 0}
            onPress={handleFinish}
            style={styles.finishButton}
          />
        </View>
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.listContent}
        data={items}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState title="Nenhum produto ainda" hint="Informe o preço abaixo e toque em Adicionar." />
        }
        renderItem={({ item, index }) => (
          <ItemRow item={item} position={items.length - index} onDelete={() => handleDelete(item)} />
        )}
      />

      <View style={[styles.form, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.formRow}>
          <TextInput
            accessibilityLabel="Preço"
            style={[styles.input, styles.priceInput]}
            keyboardType="number-pad"
            placeholder="R$ 0,00"
            placeholderTextColor={colors.disabled}
            value={priceCents > 0 ? formatCents(priceCents) : ''}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '').slice(0, MAX_PRICE_DIGITS);
              setPriceCents(digits ? parseInt(digits, 10) : 0);
            }}
          />
          <View style={styles.stepper}>
            <Pressable
              accessibilityLabel="Diminuir quantidade"
              style={styles.stepperButton}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <Text style={styles.quantity}>{quantity}</Text>
            <Pressable
              accessibilityLabel="Aumentar quantidade"
              style={styles.stepperButton}
              onPress={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}>
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>
        </View>
        <TextInput
          accessibilityLabel="Descrição"
          style={styles.input}
          placeholder="Descrição (opcional)"
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Button
          label={priceCents > 0 ? `Adicionar · ${formatCents(lineTotal)}` : 'Adicionar'}
          disabled={priceCents <= 0}
          onPress={handleAdd}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  appName: { fontSize: 22, fontWeight: '700', color: colors.primary },
  link: { fontSize: 16, fontWeight: '600', color: colors.primary },

  totalCard: {
    marginHorizontal: 16,
    padding: 16,
    gap: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  totalLabel: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  totalValue: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  totalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalMeta: { fontSize: 14, color: colors.textSecondary },
  finishButton: { minHeight: 36, paddingHorizontal: 14 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 4 },
  emptyList: { flexGrow: 1 },

  form: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  formRow: { flexDirection: 'row', gap: 10 },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  priceInput: { flex: 1, fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepperButton: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 24, color: colors.primary, fontWeight: '600' },
  quantity: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
