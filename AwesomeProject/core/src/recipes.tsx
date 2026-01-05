// src/recipes.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TextInput,
    FlatList,
    Image,
    Pressable,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { COLORS } from '../style/colors';
import { useAuth } from '../auth/AuthContext';
import GreenHeaderBG from '../components/greenHeader';
import { API_BASE } from '../api/Config';

// Lấy màu từ COLORS (CARD có default nếu COLORS không có)
const { BRAND, BRAND2, BORDER, BG, CARD = '#FFFFFF' } = COLORS;

// keyOf: gom các key AsyncStorage để lưu favorite theo từng user (tách theo uid)
// - favoritesIds: lưu mảng id recipe đã like
// - favoritesMeta: lưu map id -> thông tin recipe (để giữ dữ liệu hiển thị offline)
const keyOf = {
    favoritesMeta: (uid?: number | null) => `@nomnom_favorites_meta:${uid ?? 'guest'}`,
    favoritesIds: (uid?: number | null) => `@nomnom_favorites:${uid ?? 'guest'}`,
};

// readJson: helper đọc JSON từ AsyncStorage (nếu lỗi/không có thì trả fallback)
async function readJson<T>(key: string, fallback: T): Promise<T> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch { return fallback; }
}

// writeJson: helper ghi JSON vào AsyncStorage
async function writeJson(key: string, val: any) {
    try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch { }
}

// Recipe: model recipe dùng trong UI (đã normalize khi fetch)
type Recipe = {
    id: number;
    title: string;
    category?: string;
    subCategory?: string;
    description?: string;
    imageUrl?: string;
    timeMinutes?: number;
    calories?: number;
    rating?: number;
    totalLikes?: number;
};

// FavoriteRecipeMeta: dữ liệu tối thiểu để lưu offline cho favorites
type FavoriteRecipeMeta = {
    id: number;
    title: string;
    imageUrl?: string;
    category?: string;
    subCategory?: string;
};

export default function Recipes() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { user } = useAuth();

    // uid: id user hiện tại (nếu chưa login -> null)
    const uid = user?.id ?? null;

    // insets: safe area để chừa khoảng cho iPhone (notch) + đáy tabbar
    const insets = useSafeAreaInsets();

    // TAB_BAR_SPACE: bạn đang “bù” thêm khoảng cho tab bar theo platform
    const TAB_BAR_SPACE = Platform.OS === 'android' ? 15 : 5;

    // LIST_BOTTOM_SPACE: paddingBottom cho list để không bị tab bar đè
    const LIST_BOTTOM_SPACE = TAB_BAR_SPACE + insets.bottom + 1;

    // =========================
    // 1) Search (query + debounce)
    // =========================
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // =========================
    // 2) Filter Mode (favorites / thường)
    // =========================
    // filterMode = 'favorites' => màn hình chỉ hiển thị các recipe đã like
    const [filterMode, setFilterMode] = useState<string>('');

    // useFocusEffect: mỗi lần vào screen, đọc params:
    // - initialQuery: tự động set query (từ Grocery “Find Recipes” truyền qua)
    // - filter='favorites': mở màn favorites
    // Sau khi đọc xong, setParams về undefined để tránh bị “set lại” ở lần focus sau.
    useFocusEffect(
        useCallback(() => {
            const params = route.params || {};

            if (params.initialQuery) {
                setQuery(params.initialQuery);
                setDebouncedQuery(params.initialQuery);
                navigation.setParams({ initialQuery: undefined });
            }

            if (params.filter === 'favorites') {
                setFilterMode('favorites');
                navigation.setParams({ filter: undefined });
            }
        }, [route.params])
    );

    // Debounce query: đợi 250ms mới cập nhật debouncedQuery để filter mượt hơn
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    // =========================
    // 3) Data + trạng thái UI
    // =========================
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [data, setData] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // =========================
    // 4) Favorites (local)
    // =========================
    // favoriteIds: Set để check O(1) xem recipe đã like chưa
    const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

    // favoriteMeta: map id -> meta (để giữ info khi offline / show favorites ổn định)
    const [favoriteMeta, setFavoriteMeta] = useState<Record<string, FavoriteRecipeMeta>>({});

    // ✅ SHUFFLE DATA:
    // Mục tiêu: khi chọn category "All", list hiển thị ngẫu nhiên để nhìn “đa dạng”.
    // Lưu ý: sort(Math.random()) là kiểu shuffle nhanh nhưng không phải chuẩn tuyệt đối,
    // nhưng cho UI thường là ổn.
    const shuffledData = useMemo(() => {
        return [...data].sort(() => 0.5 - Math.random());
    }, [data]);

    // loadFavoritesLocal: đọc favorites từ AsyncStorage theo uid
    const loadFavoritesLocal = useCallback(async () => {
        const idsArr = await readJson<number[]>(keyOf.favoritesIds(uid), []);
        const metaMap = await readJson<Record<string, FavoriteRecipeMeta>>(keyOf.favoritesMeta(uid), {});
        setFavoriteIds(new Set((Array.isArray(idsArr) ? idsArr : []).map(Number)));
        setFavoriteMeta(metaMap || {});
    }, [uid]);

    // Khi uid thay đổi / mount -> load favorites local
    useEffect(() => { loadFavoritesLocal(); }, [loadFavoritesLocal]);

    // persistFavorites: cập nhật state + ghi xuống AsyncStorage
    const persistFavorites = useCallback(async (nextIds: Set<number>, nextMeta: Record<string, FavoriteRecipeMeta>) => {
        setFavoriteIds(new Set(nextIds));
        setFavoriteMeta(nextMeta);
        await writeJson(keyOf.favoritesIds(uid), Array.from(nextIds));
        await writeJson(keyOf.favoritesMeta(uid), nextMeta);
    }, [uid]);

    // =========================
    // 5) Fetch recipes từ API
    // =========================
    const fetchRecipes = useCallback(async () => {
        setErr(null);
        try {
            // token: bạn đang lấy từ AsyncStorage (đã lưu ở chỗ login)
            // headers: nếu có token thì gửi Authorization để API trả thêm dữ liệu nếu cần
            const token = await AsyncStorage.getItem('userToken');
            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch(`${API_BASE}/recipes`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            // normalize data:
            // Vì backend có thể trả key khác nhau (RecipeId/Name/Category/...)
            const normalized: Recipe[] = (Array.isArray(json) ? json : []).map((x: any, idx: number) => ({
                id: Number(x.RecipeId ?? x.recipeId ?? x.Id ?? x.id ?? idx),
                title: String(x.Name ?? x.name ?? x.Title ?? x.title ?? 'Untitled'),
                category: String(x.Category ?? x.category ?? 'Other'),
                subCategory: x.SubCategory ?? x.subCategory ?? undefined,
                description: String(x.Description ?? x.description ?? ''),
                timeMinutes: typeof x.TimeMinutes === 'number' ? x.TimeMinutes : x.timeMinutes,
                calories: typeof x.Calories === 'number' ? x.Calories : x.calories,
                imageUrl: x.ImageUrl ?? x.imageUrl ?? x.MainImageUrl ?? x.mainImageUrl ?? undefined,
                rating: typeof x.AverageRating === 'number' ? x.AverageRating : 4.5,
                totalLikes: typeof x.TotalLikes === 'number' ? x.TotalLikes : 0,
            }));

            setData(normalized);
        } catch (e: any) {
            setErr(e?.message || 'Fetch failed');
            setData([]);
        }
    }, []);

    // Lần đầu vào màn: load recipes
    useEffect(() => {
        (async () => {
            setLoading(true);
            await fetchRecipes();
            setLoading(false);
        })();
    }, [fetchRecipes]);

    // Pull-to-refresh: gọi fetchRecipes lại
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchRecipes();
        setRefreshing(false);
    }, [fetchRecipes]);

    // =========================
    // 6) toggleLike: like/unlike
    // =========================
    // - Cập nhật local trước (UI phản hồi nhanh)
    // - Sau đó (nếu có token) call API /favorites để sync server
    const toggleLike = useCallback(async (recipe: Recipe) => {
        if (!recipe?.id) return;
        const rid = recipe.id;

        // clone state ra để sửa
        const nextIds = new Set(favoriteIds);
        const nextMeta = { ...favoriteMeta };

        // nếu đã like -> bỏ like + xóa meta
        if (nextIds.has(rid)) {
            nextIds.delete(rid);
            delete nextMeta[String(rid)];
        } else {
            // nếu chưa like -> add id + lưu meta
            nextIds.add(rid);
            nextMeta[String(rid)] = {
                id: rid,
                title: recipe.title,
                imageUrl: recipe.imageUrl,
                category: recipe.category,
                subCategory: recipe.subCategory,
            };
        }

        // lưu local
        await persistFavorites(nextIds, nextMeta);

        // sync server (không bắt buộc)
        try {
            const token = await AsyncStorage.getItem('userToken');
            if (!token) return;

            await fetch(`${API_BASE}/favorites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ recipeId: rid }),
            });
        } catch { }
    }, [favoriteIds, favoriteMeta, persistFavorites]);

    // =========================
    // 7) categories: danh sách chip category
    // =========================
    // - Từ data -> lấy unique categories
    // - Sắp theo thứ tự ưu tiên: Breakfast, Lunch, Dinner, Snacks, ...
    // - Thêm "All" ở đầu
    const categories = useMemo(() => {
        const set = new Set<string>();
        data.forEach(r => set.add((r.category || 'Other').trim() || 'Other'));

        const arr = Array.from(set);
        const order = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Drink', 'Dessert', 'Other'];

        arr.sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);

            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        return ['All', ...arr];
    }, [data]);

    // =========================
    // 8) filtered: logic lọc cuối cùng (favorites / all shuffle / category / search)
    // =========================
    const filtered = useMemo(() => {
        let list: Recipe[] = [];

        // (1) chọn “nguồn list”
        if (filterMode === 'favorites') {
            // Favorites -> lọc từ data gốc (giữ thứ tự “bình thường” theo API)
            list = data.filter(r => favoriteIds.has(r.id));
        } else if (activeCategory === 'All') {
            // All -> dùng shuffledData để hiển thị ngẫu nhiên
            list = [...shuffledData];
        } else {
            // Category cụ thể -> dùng data gốc
            list = [...data];
        }

        // (2) lọc theo category (chỉ khi không phải favorites và không phải All)
        if (filterMode !== 'favorites' && activeCategory !== 'All') {
            const c = activeCategory.trim().toLowerCase();
            list = list.filter(r => ((r.category || '').trim().toLowerCase() === c));
        }

        // (3) lọc theo search keyword
        const k = debouncedQuery.toLowerCase();
        if (k) {
            list = list.filter(r => {
                const title = (r.title || '').toLowerCase();
                const desc = (r.description || '').toLowerCase();
                const cat = (r.category || '').toLowerCase();
                const sub = (r.subCategory || '').toLowerCase();
                return title.includes(k) || desc.includes(k) || cat.includes(k) || sub.includes(k);
            });
        }

        return list;
    }, [data, shuffledData, activeCategory, debouncedQuery, filterMode, favoriteIds]);

    // headerTitle: thay title header theo mode
    const headerTitle = useMemo(() => {
        if (filterMode === 'favorites') {
            return <Text style={styles.headerTitle}>Liked <Text style={{ color: '#b7f57d' }}>Recipes</Text></Text>;
        }
        return <Text style={styles.headerTitle}>Let's <Text style={{ color: '#b7f57d' }}>Cook!</Text></Text>;
    }, [filterMode]);

    // =========================
    // 9) Render UI
    // =========================
    return (
        <View style={{ flex: 1, backgroundColor: BG }}>
            {/* StatusBar: dark-content (nếu header nền đậm và muốn icon trắng, đổi light-content) */}
            <StatusBar barStyle="dark-content" />

            {/* Header xanh đậm + title + search */}
            <GreenHeaderBG backgroundColor={BRAND}>
                <View style={styles.headerRow}>
                    {headerTitle}

                    {/* Nếu đang ở favorites -> hiện nút close để thoát mode favorites */}
                    {filterMode === 'favorites' && (
                        <Pressable
                            onPress={() => setFilterMode('')}
                            style={{ padding: 4 }}
                        >
                            <Ionicons name="close-circle-outline" size={24} color="#fff" />
                        </Pressable>
                    )}
                </View>

                {/* Search box */}
                <View style={styles.searchWrap}>
                    <Image
                        source={require('../assets/icon/search.png')}
                        style={{ width: 20, height: 20, tintColor: 'rgba(0,0,0,0.45)' }}
                    />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={filterMode === 'favorites' ? "Search in liked..." : "Search recipes..."}
                        placeholderTextColor="rgba(0,0,0,0.45)"
                        style={styles.searchInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    {/* Nút clear query */}
                    {!!query && (
                        <Pressable onPress={() => setQuery('')} hitSlop={10}>
                            <Ionicons name="close-circle" size={18} color="rgba(0,0,0,0.45)" />
                        </Pressable>
                    )}
                </View>
            </GreenHeaderBG>

            {/* Body: chips + list */}
            <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
                {/* Category chips */}
                <View style={{ paddingHorizontal: 16, marginBottom: 20, marginTop: 12 }}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipsRow}
                    >
                        {categories.map(c => {
                            const active = c === activeCategory;
                            return (
                                <Pressable
                                    key={c}
                                    onPress={() => setActiveCategory(c)}
                                    style={[styles.chip, active && styles.chipActive]}
                                >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                        {c}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Loading / Error / List */}
                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={BRAND} />
                        <Text style={styles.centerText}>Loading...</Text>
                    </View>
                ) : err ? (
                    <View style={styles.center}>
                        <Text style={styles.centerText}>Error: {err}</Text>
                        <Pressable onPress={onRefresh} style={styles.retryBtn}>
                            <Text style={styles.retryText}>Retry</Text>
                        </Pressable>
                    </View>
                ) : (
                    <FlatList
                        // data đã được lọc theo filterMode + category + search
                        data={filtered}
                        keyExtractor={r => String(r.id)}

                        // grid 2 cột
                        numColumns={2}
                        columnWrapperStyle={{ justifyContent: 'space-between' }}

                        // pull-to-refresh
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}

                        // padding bottom để tránh tabbar đè
                        contentContainerStyle={[styles.listContent, { paddingBottom: LIST_BOTTOM_SPACE }]}
                        showsVerticalScrollIndicator={false}
                        ListFooterComponent={<View style={{ height: LIST_BOTTOM_SPACE }} />}

                        renderItem={({ item }) => {
                            const liked = favoriteIds.has(item.id);

                            // ratingText: nếu không có rating -> fallback 4.5
                            const ratingText = typeof item.rating === 'number' ? item.rating.toFixed(1) : '4.5';

                            return (
                                <View style={styles.gridWrap}>
                                    <Pressable
                                        onPress={() => navigation.navigate('RecipeDetail', { id: item.id })}
                                        style={({ pressed }) => [
                                            styles.card,
                                            pressed && { transform: [{ scale: 0.995 }], opacity: 0.98 }
                                        ]}
                                    >
                                        {/* ảnh + badge rating + nút heart */}
                                        <View style={styles.imageWrap}>
                                            <Image
                                                source={item.imageUrl ? { uri: item.imageUrl } : require('../assets/icon/image-placeholder.png')}
                                                style={styles.image}
                                            />

                                            <View style={styles.ratingBadge}>
                                                <Image
                                                    source={require('../assets/icon/Star 1.png')}
                                                    style={{ width: 14, height: 14, tintColor: '#FFC107' }}
                                                />
                                                <Text style={styles.ratingText}>{ratingText}</Text>
                                            </View>

                                            <Pressable
                                                hitSlop={8}
                                                onPress={() => toggleLike(item)}
                                                style={({ pressed }) => [
                                                    styles.heartBtn,
                                                    pressed && { transform: [{ scale: 0.96 }], opacity: 0.95 }
                                                ]}
                                            >
                                                <Image
                                                    source={
                                                        liked
                                                            ? require('../assets/icon/heartfill.png')
                                                            : require('../assets/icon/heart.png')
                                                    }
                                                    style={[styles.heartIcon, liked && styles.heartIconLiked]}
                                                />
                                            </Pressable>
                                        </View>

                                        {/* info: title, tag, meta */}
                                        <View style={styles.content}>
                                            <Text numberOfLines={1} style={styles.title}>{item.title}</Text>

                                            {!!item.subCategory ? (
                                                <View style={styles.tagRow}>
                                                    <View style={styles.tagChip}>
                                                        <Text style={styles.tagText}>{item.subCategory}</Text>
                                                    </View>
                                                </View>
                                            ) : (
                                                // nếu không có subCategory, chừa khoảng nhỏ để layout không bị “nhảy”
                                                <View style={{ height: 6 }} />
                                            )}

                                            <View style={styles.metaRow}>
                                                {!!item.timeMinutes && (
                                                    <View style={styles.metaItem}>
                                                        <Image
                                                            source={require('../assets/icon/clock.png')}
                                                            style={styles.customIcon}
                                                        />
                                                        <Text style={styles.metaText}>{item.timeMinutes}m</Text>
                                                    </View>
                                                )}
                                                {!!item.calories && (
                                                    <View style={styles.metaItem}>
                                                        <Image
                                                            source={require('../assets/icon/Vector.png')}
                                                            style={styles.customIcon}
                                                        />
                                                        <Text style={styles.metaText}>{item.calories}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    </Pressable>
                                </View>
                            );
                        }}

                        // Khi list trống
                        ListEmptyComponent={
                            <View style={{ paddingTop: 40, alignItems: 'center' }}>
                                <Text style={{ fontWeight: '800', color: BRAND2, opacity: 0.7 }}>
                                    {filterMode === 'favorites'
                                        ? "You haven't liked any recipes yet."
                                        : "No recipes found."}
                                </Text>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    // Header
    headerRow: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    headerTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginTop: 4 },

    // Search box
    searchWrap: {
        marginHorizontal: 16,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: BORDER,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center'
    },
    searchInput: {
        flex: 1,
        color: '#0b1a18',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8
    },

    // Category chips
    chipsRow: { paddingRight: 10 },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: '#fff',
        marginRight: 8
    },
    chipActive: { backgroundColor: BRAND, borderColor: BRAND },
    chipText: { fontWeight: '800', fontSize: 12, color: BRAND2 },
    chipTextActive: { color: '#fff' },

    // List/Grid
    listContent: { paddingHorizontal: 16, paddingTop: 2 },
    gridWrap: { width: '48%', marginBottom: 12 },

    // Card
    card: {
        flex: 1,
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        overflow: 'hidden'
    },

    // Image
    imageWrap: { position: 'relative', height: 130, width: '100%', backgroundColor: '#eee' },
    image: { width: '100%', height: '100%', resizeMode: 'cover' },

    // Rating badge
    ratingBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(255,255,255,0.92)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 10
    },
    ratingText: { marginLeft: 5, fontSize: 11, fontWeight: '900', color: '#000' },

    // Heart button
    heartBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)'
    },
    heartIcon: { width: 18, height: 18, tintColor: BRAND },
    heartIconLiked: { tintColor: '#FF3B30' },

    // Content
    content: { padding: 10 },
    title: { fontSize: 14, fontWeight: '900', color: '#0b1a18' },

    // Tag
    tagRow: { marginTop: 6, flexDirection: 'row' },
    tagChip: { backgroundColor: '#eaf6e8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    tagText: { color: BRAND, fontSize: 10, fontWeight: '800' },

    // Meta
    metaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
    metaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
    metaText: { marginLeft: 4, fontSize: 11, fontWeight: '800', color: BRAND2, opacity: 0.85 },

    // Loading/Error
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
    centerText: { fontWeight: '800', color: BRAND2, opacity: 0.8 },
    retryBtn: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: BRAND },
    retryText: { color: '#fff', fontWeight: '900' },
    // Icon custom
    customIcon: {
        width: 14,
        height: 14,
        resizeMode: 'contain',
        tintColor: BRAND
    },
});
