import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EditItemModal } from '@/components/edit-item-modal';
import { EmptyState } from '@/components/empty-state';
import { ItemRow } from '@/components/item-row';
import { PriceInput } from '@/components/price-input';
import {
  addItem,
  clearItems,
  deleteItem,
  finishPurchase,
  getCurrentPurchaseId,
  listItems,
  totalCents,
  updateItem,
  type Item,
} from '@/db';
import { formatCents, pluralize } from '@/lib/format';
import { colors, radius } from '@/theme';

const MAX_QUANTITY = 999;
// Time for the camera screen to finish closing before the price field takes focus.
const FOCUS_DELAY_MS = 450;
// Text recognition runs on-device and is only available on iOS/Android.
const CAN_SCAN = Platform.OS !== 'web';

export default function CurrentPurchaseScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const priceInput = useRef<TextInput>(null);
  // Set by the camera screen to hand over to typing ("Digitar preço"); changes on every use.
  const { focusPrice } = useLocalSearchParams<{ focusPrice?: string }>();

  const [purchaseId, setPurchaseId] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);

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

  useEffect(() => {
    if (!focusPrice) return;
    // The camera screen is still sliding away for a moment; focusing before that is ignored.
    const timer = setTimeout(() => priceInput.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [focusPrice]);

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

  async function handleSave(changes: {
    description: string | null;
    priceCents: number;
    quantity: number;
  }) {
    if (!editing) return;
    await updateItem(db, editing.id, changes);
    setEditing(null);
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

  function handleClear() {
    if (purchaseId === null) return;
    const count = pluralize(items.length, 'item será removido', 'itens serão removidos');
    Alert.alert('Limpar itens?', `${count} da compra.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          await clearItems(db, purchaseId);
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
          <View style={styles.totalInfo}>
            <Text style={styles.totalMeta}>
              {pluralize(items.length, 'item', 'itens')} · {pluralize(units, 'unidade', 'unidades')}
            </Text>
            {items.length > 0 && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={handleClear}>
                <Text style={styles.clearLink}>Limpar itens</Text>
              </Pressable>
            )}
          </View>
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
          <EmptyState
            title="Nenhum produto ainda"
            hint={
              CAN_SCAN
                ? 'Leia o preço pela câmera ou digite abaixo e toque em Adicionar.'
                : 'Informe o preço abaixo e toque em Adicionar.'
            }
          />
        }
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            onEdit={() => setEditing(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
      />

      <View style={[styles.form, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.formRow}>
          {CAN_SCAN && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Escanear preço"
              style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
              onPress={() => router.push('/scan')}>
              <Image
                source={require('../../assets/images/scanner.png')}
                tintColor={colors.primary}
                style={styles.scanIcon}
                contentFit="contain"
              />
            </Pressable>
          )}
          <PriceInput
            ref={priceInput}
            accessibilityLabel="Preço"
            style={[styles.input, styles.priceInput]}
            cents={priceCents}
            onChangeCents={setPriceCents}
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

      {editing && (
        <EditItemModal item={editing} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
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
    fontSize: 32,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  totalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalInfo: { gap: 2 },
  totalMeta: { fontSize: 14, color: colors.textSecondary },
  clearLink: { fontSize: 14, fontWeight: '600', color: colors.danger },
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
  scanButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  scanButtonPressed: { opacity: 0.7 },
  scanIcon: { width: 40, height: 40 },
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
