import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    FlatList,
    Pressable,
    Modal,
    TextInput,
    Image,
    Alert,
    ScrollView,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import GreenHeaderBG from '../components/greenHeader';
import Feather from 'react-native-vector-icons/Feather';
import { COLORS } from '../style/colors';
import { API_BASE } from '../api/Config';
// ==============================
// 🎨 BẢNG MÀU CHUẨN
// ==============================
// BRAND: xanh đậm (header/primary button)
// BRAND2: xanh chữ
// BRAND_LIGHT: nền nhẹ cho icon
// BORDER: viền card
// BG: nền toàn màn
const { BRAND, BRAND2, BRAND_LIGHT, BORDER, BG } = COLORS;

// ==============================
// ✅ TYPE / MODEL (Kiểu dữ liệu)
// ==============================
// Unit: đơn vị
type Unit = 'G' | 'KG' | 'L' | 'Bunch' | 'Loaf' | 'Piece';

// Category: nhóm thực phẩm
type Category = 'Meat' | 'Vegetables' | 'Dairy' | 'Grains' | 'Other';

// 1 item grocery
type GroceryItem = {
    id: string;
    name: string;
    qty: number;
    unit: Unit;
    checked?: boolean; // checked = true => item được chọn để search recipe
    category: Category;
};

// 1 section = 1 category + list item
type Section = {
    id: string;
    title: Category;
    items: GroceryItem[];
};

// ==============================
// ✅ SEED: dữ liệu khởi tạo theo 5 category
// Mục đích: UI luôn có đủ các nhóm (tránh thiếu category nếu dữ liệu cũ lỗi)
// ==============================
const seed: Section[] = [
    { id: 's1', title: 'Meat', items: [] },
    { id: 's2', title: 'Vegetables', items: [] },
    { id: 's3', title: 'Dairy', items: [] },
    { id: 's4', title: 'Grains', items: [] },
    { id: 's5', title: 'Other', items: [] },
];

// ==============================
// ✅ QUICK ADD gợi ý nhanh
// Chỉ là danh sách “mẫu”, bấm vào sẽ add ngay vào list
// ==============================
const SUGGESTIONS = [
    { name: 'Eggs', cat: 'Dairy', unit: 'Piece' },
    { name: 'Milk', cat: 'Dairy', unit: 'L' },
    { name: 'Rice', cat: 'Grains', unit: 'KG' },
    { name: 'Onion', cat: 'Vegetables', unit: 'Piece' },
    { name: 'Garlic', cat: 'Vegetables', unit: 'Bunch' },
    { name: 'Beef', cat: 'Meat', unit: 'G' },
    { name: 'Chicken', cat: 'Meat', unit: 'G' },
    { name: 'Potato', cat: 'Vegetables', unit: 'Piece' },
];

// ==============================
// Helper: đọc JSON từ AsyncStorage an toàn
// - key: tên key
// - fallback: dữ liệu mặc định nếu không có hoặc JSON lỗi
// ==============================
async function readJson<T>(key: string, fallback: T): Promise<T> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export default function ListScreen() {
    // ==============================
    // 1) HOOKS / CONTEXT
    // ==============================
    const navigation = useNavigation<any>();

    // lấy user từ AuthContext để tạo key theo user (mỗi user có dữ liệu riêng)
    const { user } = useAuth();

    // insets: lấy safe area bottom (đặc biệt hữu dụng trong modal sheet)
    const insets = useSafeAreaInsets();

    // uid: nếu chưa login thì null => dùng 'guest'
    const uid = user?.id ?? null;

    // ==============================
    // 2) KEY LƯU STORAGE THEO USER
    // ==============================
    // sectionsKey: lưu nguyên Section[] để UI load nhanh và đúng category
    const sectionsKey = `@nomnom_fridge_sections:${uid ?? 'guest'}`;

    // groceryKey: lưu list dạng "phẳng" để Profile đọc count “Grocery Lists”
    const groceryKey = `@nomnom_grocery:${uid ?? 'guest'}`;

    // ==============================
    // 3) STATE
    // ==============================
    const [sections, setSections] = useState<Section[]>(seed);
    const [loading, setLoading] = useState(true);

    // modal add ingredient
    const [addVisible, setAddVisible] = useState(false);

    // modal confirm clear all
    const [confirmVisible, setConfirmVisible] = useState(false);

    // Form Add
    const [fName, setFName] = useState('');
    const [fCategory, setFCategory] = useState<Category>('Vegetables');
    const [fQty, setFQty] = useState<string>('1');
    const [fUnit, setFUnit] = useState<Unit>('KG');

    // danh sách unit + category cho modal chọn nhanh
    const allUnits: Unit[] = ['G', 'KG', 'L', 'Bunch', 'Loaf', 'Piece'];
    const allCats: Category[] = ['Meat', 'Vegetables', 'Dairy', 'Grains', 'Other'];

    // ==============================
    // 4) DERIVED DATA (useMemo)
    // ==============================
    // visibleSections: chỉ show section có item > 0
    // Vì seed luôn có 5 section, nên nếu không filter thì FlatList lúc nào cũng "có data"
    const visibleSections = useMemo(
        () => sections.filter(s => (s.items?.length || 0) > 0),
        [sections]
    );

    // ==============================
    // 5) PERSIST: Lưu dữ liệu
    // ==============================
    // persist(newSections):
    // - setState để UI cập nhật ngay
    // - lưu 2 dạng:
    //   (1) sectionsKey: nguyên Section[]
    //   (2) groceryKey: flat list để Profile đếm
    const persist = useCallback(
        async (newSections: Section[]) => {
            setSections(newSections);

            try {
                // 1) Lưu sections cho UI
                await AsyncStorage.setItem(sectionsKey, JSON.stringify(newSections));

                // 2) Lưu flat list cho Profile
                const flat = newSections.flatMap(s =>
                    (s.items || []).map(it => ({
                        id: it.id,
                        name: it.name,
                        qty: String(it.qty),
                        unit: it.unit,
                        checked: !!it.checked,
                        category: it.category,
                    }))
                );

                await AsyncStorage.setItem(groceryKey, JSON.stringify(flat));
            } catch (e) {
                console.error(e);
            }
        },
        [sectionsKey, groceryKey]
    );

    // ==============================
    // 6) LOAD DATA: chạy mỗi khi sectionsKey đổi
    // - sectionsKey đổi khi user đổi (logout/login user khác)
    // ==============================
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // đọc data đã lưu
                const saved = await readJson<Section[]>(sectionsKey, seed);

                // normalize: đảm bảo đủ 5 category
                const map = new Map<Category, Section>();

                // tạo khung đầy đủ category từ seed
                for (const s of seed) map.set(s.title, { ...s, items: [] });

                // merge data saved vào map
                for (const s of Array.isArray(saved) ? saved : []) {
                    if (!s?.title) continue;

                    const title = s.title as Category;

                    // nếu trong saved có category lạ thì tạo luôn (phòng lỗi dữ liệu)
                    if (!map.has(title)) {
                        map.set(title, { id: s.id || `s_${Date.now()}`, title, items: [] });
                    }

                    const cur = map.get(title)!;
                    cur.items = Array.isArray(s.items) ? s.items : [];
                    map.set(title, cur);
                }

                // setSections theo đúng thứ tự seed
                setSections(seed.map(s => map.get(s.title) || s));
            } catch (e) {
                // nếu lỗi => reset về seed
                setSections(seed);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [sectionsKey]);

    // ==============================
    // 7) HANDLERS: toggle / delete / add
    // ==============================

    // toggleCheck: bấm 1 item để bật/tắt checked
    const toggleCheck = (sid: string, iid: string) => {
        const newSections = sections.map(s =>
            s.id !== sid
                ? s
                : {
                    ...s,
                    items: s.items.map(it =>
                        it.id === iid ? { ...it, checked: !it.checked } : it
                    ),
                }
        );

        persist(newSections);
    };

    // deleteItem: xóa 1 item
    const deleteItem = (sid: string, iid: string) => {
        const newSections = sections.map(s =>
            s.id !== sid ? s : { ...s, items: s.items.filter(i => i.id !== iid) }
        );

        persist(newSections);
    };

    // handleAddItem: add từ Quick Add hoặc từ form
    // - nếu trùng name + trùng unit trong cùng category => cộng dồn qty
    const handleAddItem = (name: string, cat: Category, qty: number, unit: Unit) => {
        const n = name.trim();
        if (!n) return;

        const newSections = [...sections];

        // tìm section theo category
        let secIdx = newSections.findIndex(s => s.title === cat);

        // nếu không có thì tạo section mới
        if (secIdx === -1) {
            newSections.push({ id: `s_${Date.now()}`, title: cat, items: [] });
            secIdx = newSections.length - 1;
        }

        const list = [...(newSections[secIdx].items || [])];

        // tìm item trùng (name + unit)
        const dupIdx = list.findIndex(
            x => x.name.toLowerCase() === n.toLowerCase() && x.unit === unit
        );

        if (dupIdx >= 0) {
            // trùng => cộng dồn qty, set checked true
            list[dupIdx] = {
                ...list[dupIdx],
                qty: (list[dupIdx].qty || 0) + qty,
                checked: true,
            };
        } else {
            // không trùng => push item mới
            list.push({
                id: `i_${Date.now()}_${Math.random()}`,
                name: n,
                qty,
                unit,
                category: cat,
                checked: true,
            });
        }

        newSections[secIdx] = { ...newSections[secIdx], items: list };
        persist(newSections);
    };

    // submitForm: validate form rồi add
    const submitForm = () => {
        const qtyNum = Number(fQty);

        if (!fName.trim() || !isFinite(qtyNum) || qtyNum <= 0) {
            Alert.alert('Invalid input');
            return;
        }

        handleAddItem(fName, fCategory, qtyNum, fUnit);

        // reset form + đóng modal
        setFName('');
        setFQty('1');
        setAddVisible(false);
    };

    // handleFindRecipes: gom tất cả item checked => điều hướng sang Recipes với initialQuery
    const handleFindRecipes = () => {
        const selectedIngredients: string[] = [];

        for (const section of sections) {
            for (const item of section.items) {
                if (item.checked) selectedIngredients.push(item.name);
            }
        }

        if (selectedIngredients.length === 0) {
            Alert.alert('No ingredients selected');
            return;
        }

        navigation.navigate('Recipes', { initialQuery: selectedIngredients.join(' ') });
    };

    // clearAll: xóa toàn bộ items trong 5 section
    const clearAll = () => {
        persist(sections.map(s => ({ ...s, items: [] })));
        setConfirmVisible(false);
    };

    // ==============================
    // 8) LOADING UI
    // ==============================
    if (loading) {
        return (
            <View style={[styles.center, { flex: 1, backgroundColor: COLORS.BG }]}>
                <ActivityIndicator size="large" color={COLORS.BRAND} />
            </View>
        );
    }

    // ==============================
    // 9) RENDER UI CHÍNH
    // ==============================
    return (
        <View style={{ flex: 1, backgroundColor: COLORS.BG }}>
            {/* StatusBar sáng chữ để nhìn rõ trên header xanh */}
            <StatusBar barStyle="light-content" />

            {/* ===== HEADER ===== */}
            <GreenHeaderBG backgroundColor={COLORS.BRAND}>
                {/* Title + nút trash */}
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.headerTitle}>
                            Grocery{' '}
                            <Text style={{ fontSize: 24, fontWeight: '800', color: '#b7f57d', opacity: 1 }}>
                                List
                            </Text>
                        </Text>
                    </View>

                    {/* bấm => mở confirm clear all */}
                    <Pressable onPress={() => setConfirmVisible(true)} hitSlop={10}>
                        <Image
                            source={require('../assets/icon/trash.png')}
                            style={{ width: 22, height: 22, tintColor: '#fff' }}
                        />
                    </Pressable>
                </View>

                {/* Quick Add scroll ngang */}
                <View style={styles.quickWrap}>
                    {/* 2 view “fadeEdge” để sau này nếu muốn làm hiệu ứng gradient 2 bên */}
                    <View pointerEvents="none" style={[styles.fadeEdge, styles.fadeLeft]} />

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.quickContent}
                    >
                        {/* Pill title */}
                        <View style={styles.quickTitlePill}>
                            <Feather name="zap" size={14} color="#fff" />
                            <Text style={styles.quickTitle}>Quick Add</Text>
                        </View>

                        {/* Chips */}
                        {SUGGESTIONS.map((s, index) => (
                            <Pressable
                                key={index}
                                onPress={() => handleAddItem(s.name, s.cat as Category, 1, s.unit as Unit)}
                                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                            >
                                <View style={styles.plusDot}>
                                    <Feather name="plus" size={12} color="#fff" />
                                </View>
                                <Text style={styles.chipText}>{s.name}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>

                    <View pointerEvents="none" style={[styles.fadeEdge, styles.fadeRight]} />
                </View>
            </GreenHeaderBG>

            {/* ===== BODY ===== */}
            <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
                {/* 2 nút hành động */}
                <View style={styles.actionRow}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.actionBtn,
                            styles.actionPrimary,
                            pressed && { opacity: 0.9 },
                        ]}
                        onPress={handleFindRecipes}
                    >
                        <Image
                            source={require('../assets/icon/search.png')}
                            style={{ width: 16, height: 16, tintColor: '#fff', marginRight: 8 }}
                        />
                        <Text style={[styles.actionText, { color: '#fff' }]}>Find Recipes</Text>
                    </Pressable>

                    <Pressable style={[styles.actionBtn, styles.actionGhost]} onPress={() => setAddVisible(true)}>
                        <Text style={[styles.actionText, { color: COLORS.BRAND }]}>Custom Add</Text>
                    </Pressable>
                </View>

                {/* Danh sách section */}
                <FlatList
                    data={visibleSections}
                    keyExtractor={s => s.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                    renderItem={({ item: s }) => (
                        <View style={styles.sectionBox}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>{s.title}</Text>
                                <Text style={styles.sectionSub}>{s.items.length}</Text>
                            </View>

                            <View style={{ gap: 8 }}>
                                {s.items.map(it => (
                                    <Pressable
                                        key={it.id}
                                        // pressed: giảm opacity khi bấm
                                        // checked: đổi background + viền để “highlight”
                                        style={({ pressed }) => [
                                            styles.itemRow,
                                            it.checked && { backgroundColor: COLORS.BRAND3, borderColor: COLORS.BRAND },
                                            { opacity: pressed ? 0.8 : 1 },
                                        ]}
                                        onPress={() => toggleCheck(s.id, it.id)}
                                    >
                                        {/* checkbox */}
                                        <View
                                            style={[
                                                styles.checkBox,
                                                it.checked && { backgroundColor: COLORS.BRAND, borderColor: COLORS.BRAND },
                                            ]}
                                        >
                                            {it.checked && (
                                                <Image
                                                    source={require('../assets/icon/tick.png')}
                                                    style={{ width: 10, height: 10, tintColor: '#fff' }}
                                                />
                                            )}
                                        </View>

                                        {/* name */}
                                        <Text
                                            numberOfLines={1}
                                            style={[
                                                styles.itemName,
                                                it.checked && { fontWeight: '700', color: COLORS.BRAND },
                                            ]}
                                        >
                                            {it.name}
                                        </Text>

                                        {/* badge qty/unit */}
                                        <View style={styles.badge}>
                                            <Text style={styles.badgeText}>
                                                {it.qty} {it.unit}
                                            </Text>
                                        </View>

                                        {/* nút delete item */}
                                        <Pressable
                                            onPress={() => deleteItem(s.id, it.id)}
                                            hitSlop={10}
                                            style={({ pressed }) => ({
                                                height: 20,
                                                width: 20,
                                                padding: 6,
                                                borderWidth: 1,
                                                borderColor: '#fa8282ff',
                                                borderRadius: 6,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginLeft: 8,
                                                backgroundColor: pressed ? '#fa8282ff' : 'transparent',
                                            })}
                                        >
                                            {({ pressed }) => (
                                                <Image
                                                    source={require('../assets/icon/minus.png')}
                                                    style={{
                                                        width: 12,
                                                        height: 2,
                                                        tintColor: pressed ? '#ffffff' : '#fa8282ff',
                                                    }}
                                                />
                                            )}
                                        </Pressable>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    )}
                    // Nếu rỗng => show empty state
                    ListEmptyComponent={
                        <View style={{ marginTop: 60, alignItems: 'center' }}>
                            <Image
                                source={require('../assets/icon/shop.png')}
                                style={{ width: 60, height: 60, tintColor: '#ddd', marginBottom: 12 }}
                            />
                            <Text style={{ color: COLORS.MUTED, fontWeight: '600' }}>
                                Your grocery list is empty!
                            </Text>
                        </View>
                    }
                />
            </SafeAreaView>

            {/* ==============================
          MODAL: ADD CUSTOM INGREDIENT
         ============================== */}
            <Modal
                visible={addVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setAddVisible(false)}
            >
                <View style={styles.sheetOverlay}>
                    {/* Bấm vùng tối để đóng */}
                    <Pressable style={{ flex: 1 }} onPress={() => setAddVisible(false)} />

                    {/* Đẩy sheet lên khi keyboard bật (iOS) */}
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={{ width: '100%' }}
                    >
                        <View style={[styles.sheetBox, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                            <View style={styles.sheetHandle} />
                            <Text style={styles.sheetTitleText}>Add Custom Ingredient</Text>

                            {/* Name */}
                            <View style={styles.field}>
                                <Text style={styles.label}>Name</Text>
                                <TextInput
                                    value={fName}
                                    onChangeText={setFName}
                                    style={styles.input}
                                    placeholder="e.g. Avocado"
                                    placeholderTextColor="#999"
                                />
                            </View>

                            {/* Category chips */}
                            <View style={styles.field}>
                                <Text style={styles.label}>Category</Text>
                                <View style={styles.chipRow}>
                                    {allCats.map(c => {
                                        const isActive = fCategory === c;
                                        return (
                                            <Pressable
                                                key={c}
                                                onPress={() => setFCategory(c)}
                                                style={[
                                                    styles.modalChip,
                                                    isActive ? styles.modalChipActive : styles.modalChipInactive,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.modalChipText,
                                                        isActive ? styles.modalChipTextActive : styles.modalChipTextInactive,
                                                    ]}
                                                >
                                                    {c}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Qty + Unit */}
                            <View style={{ flexDirection: 'row', gap: 16 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Qty</Text>
                                    <TextInput
                                        value={fQty}
                                        onChangeText={setFQty}
                                        keyboardType="numeric"
                                        style={[styles.input, { textAlign: 'center' }]}
                                    />
                                </View>

                                <View style={{ flex: 2 }}>
                                    <Text style={styles.label}>Unit</Text>
                                    <View style={styles.unitContainer}>
                                        {allUnits.map(u => {
                                            const isActive = fUnit === u;
                                            return (
                                                <Pressable
                                                    key={u}
                                                    onPress={() => setFUnit(u)}
                                                    style={[styles.unitBox, isActive ? styles.modalChipActive : styles.modalChipInactive]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.modalChipText,
                                                            isActive ? styles.modalChipTextActive : styles.modalChipTextInactive,
                                                        ]}
                                                    >
                                                        {u}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            </View>

                            {/* Buttons */}
                            <View style={{ marginTop: 24, gap: 12 }}>
                                <Pressable style={styles.addBtn} onPress={submitForm}>
                                    <Text style={styles.addBtnText}>Add to List</Text>
                                </Pressable>

                                <Pressable style={styles.cancelBtn} onPress={() => setAddVisible(false)}>
                                    <Text style={styles.cancelText}>Cancel</Text>
                                </Pressable>
                            </View>

                            {/* “Fake background” để chống hở nền dưới sheet khi keyboard/safearea */}
                            <View
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    height: 1000,
                                    backgroundColor: COLORS.CARD,
                                }}
                            />
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ==============================
          MODAL: CONFIRM CLEAR ALL
         ============================== */}
            <Modal
                visible={confirmVisible}
                animationType="fade"
                transparent
                onRequestClose={() => setConfirmVisible(false)}
            >
                <View style={styles.alertOverlay}>
                    <View style={styles.alertBox}>
                        <Image
                            source={require('../assets/icon/alert.png')}
                            style={{ width: 80, height: 80, tintColor: '#b7f57d', marginBottom: 10 }}
                        />
                        <Text style={styles.alertTitle}>Clear all items?</Text>
                        <Text style={styles.alertSub}>This cannot be undone.</Text>

                        <Pressable style={styles.alertPrimary} onPress={clearAll}>
                            <Text style={styles.alertPrimaryText}>Yes, Clear All</Text>
                        </Pressable>

                        <Pressable style={styles.alertGhost} onPress={() => setConfirmVisible(false)}>
                            <Text style={styles.alertGhostText}>Cancel</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ==============================
// ✅ STYLES
// ==============================
const styles = StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center' },

    // Header
    headerRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },

    // Quick Add
    quickWrap: { marginBottom: 10, paddingTop: 10, position: 'relative' },
    quickContent: { paddingHorizontal: 16, paddingVertical: 6, gap: 10, alignItems: 'center' },
    quickTitlePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    quickTitle: { fontSize: 12, fontWeight: '800', color: '#fff', opacity: 0.95 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    chipPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
    plusDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    chipText: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
    fadeEdge: { position: 'absolute', top: 0, bottom: 0, width: 22, zIndex: 2 },
    fadeLeft: { left: 0, backgroundColor: 'rgba(0,0,0,0.00)' },
    fadeRight: { right: 0, backgroundColor: 'rgba(0,0,0,0.00)' },

    // Actions & List
    actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16, marginBottom: 16 },
    actionBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    actionPrimary: { backgroundColor: COLORS.BRAND, shadowColor: COLORS.BRAND, shadowOpacity: 0.3, shadowRadius: 5, elevation: 4 },
    actionGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.BORDER },
    actionText: { fontWeight: '700', fontSize: 15 },

    sectionBox: { marginBottom: 16, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: COLORS.BORDER },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    sectionTitle: { fontWeight: '800', fontSize: 16, color: COLORS.BRAND2 },
    sectionSub: { fontSize: 12, color: COLORS.MUTED, fontWeight: '700' },
    itemRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: '#f9f9f9', marginBottom: 6, borderWidth: 1, borderColor: 'transparent' },
    checkBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#ccc', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
    itemName: { flex: 1, fontWeight: '600', color: COLORS.TEXT, fontSize: 15 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
    badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.MUTED },

    // Modal add
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheetBox: {
        backgroundColor: COLORS.CARD,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        width: '100%',
        overflow: 'visible',
    },
    sheetHandle: { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 20, marginTop: 4 },
    sheetTitleText: { fontSize: 18, fontWeight: '600', color: COLORS.BRAND2, marginBottom: 20 },

    field: { marginBottom: 20 },
    label: { fontSize: 13, fontWeight: '700', color: COLORS.MUTED, marginBottom: 10 },
    input: {
        backgroundColor: COLORS.CARD,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.BORDER,
        paddingHorizontal: 16,
        fontWeight: '600',
        color: COLORS.TEXT,
        fontSize: 16,
    },

    chipRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    modalChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    modalChipActive: { backgroundColor: COLORS.BRAND3, borderWidth: 1.5, borderColor: COLORS.BRAND },
    modalChipInactive: { backgroundColor: BG, borderWidth: 0 },
    modalChipText: { fontSize: 12, fontWeight: '700' },
    modalChipTextActive: { color: COLORS.BRAND },
    modalChipTextInactive: { color: COLORS.MUTED },

    unitContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    unitBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    addBtn: { backgroundColor: COLORS.BRAND, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.BRAND, shadowOpacity: 0.3, shadowRadius: 5, elevation: 4 },
    addBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    cancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontWeight: '700', color: COLORS.MUTED },

    // Modal confirm
    alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    alertBox: { width: '80%', backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center' },
    alertTitle: { fontSize: 18, fontWeight: '800', color: COLORS.BRAND2 },
    alertSub: { textAlign: 'center', color: COLORS.MUTED, marginVertical: 10 },
    alertPrimary: { width: '100%', backgroundColor: COLORS.BRAND, padding: 14, borderRadius: 12, alignItems: 'center' },
    alertPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    alertGhost: { marginTop: 12 },
    alertGhostText: { fontWeight: '700', color: COLORS.MUTED },
});
