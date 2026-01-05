// src/home.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    Platform,
    Dimensions,
    TextInput,
    ScrollView,
    Image,
    Pressable,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../style/colors';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../api/Config';
// --- CẤU HÌNH API & KÍCH THƯỚC ---


const { width } = Dimensions.get('window');
const CONTENT_W = width - 32; // Lề trái phải mỗi bên 16px
const GAP = 15; // Khoảng cách giữa 2 cột (tăng lên chút cho thoáng)
const ITEM_WIDTH = (CONTENT_W - GAP) / 2; // Chiều rộng thẻ Popular chuẩn xác

const { BRAND, BRAND2, BRAND_LIGHT, BORDER, BG, HEART, CARD } = COLORS;

// --- TYPE DEFINITIONS ---
type DayItem = { key: string; day: string; date: string; iso: string };

type Recipe = {
    id?: number;
    title?: string;
    category?: string;
    subCategory?: string;
    description?: string;
    imageUrl?: string;
    timeMinutes?: number;
    calories?: number;
    videoUrl?: string;
    rating?: number;
    isLiked?: boolean;
    totalLikes?: number;
    servings?: number;
};

// --- HELPER FUNCTIONS ---
function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
}

function formatDayShort(d: Date) {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return days[d.getDay()];
}

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function toISODate(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildRollingDays(): DayItem[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const arr: DayItem[] = [];
    for (let i = -2; i <= 4; i++) {
        const x = new Date(today);
        x.setDate(today.getDate() + i);
        arr.push({
            key: toISODate(x),
            iso: toISODate(x),
            day: formatDayShort(x),
            date: String(x.getDate()),
        });
    }
    return arr;
}

const favoritesKey = (uid?: number | null) => `@nomnom_favorites:${uid ?? 'guest'}`;

async function loadFavoriteSet(uid?: number | null) {
    try {
        const raw = await AsyncStorage.getItem(favoritesKey(uid));
        const arr = raw ? JSON.parse(raw) : [];
        return new Set<number>(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set<number>();
    }
}

async function saveFavoriteSet(uid: number | null | undefined, set: Set<number>) {
    await AsyncStorage.setItem(favoritesKey(uid), JSON.stringify([...set]));
}

// ====================================================================
// ✅ COMPONENT GREEN HEADER (ĐÃ SỬA GIAO DIỆN)
// ====================================================================
type GreenHeaderProps = {
    greeting: string;
    userName: string;
    activeMealType: string;
    query: string;
    setQuery: (text: string) => void;
};

const GreenHeader: React.FC<GreenHeaderProps> = ({
    greeting,
    userName,
    activeMealType,
    query,
    setQuery,
}) => {
    return (
        <View style={styles.headerContainer}>
            <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
                <View style={styles.headerContent}>
                    {/* Greeting */}
                    <Text style={styles.smallHello}>
                        {greeting}
                        {userName ? `, ${userName}` : ''}
                    </Text>

                    {/* Big Title */}
                    <Text style={styles.bigTitle}>
                        It’s time to cook <Text style={{ color: '#b7f57d' }}>{activeMealType}</Text>
                    </Text>
                </View>
            </SafeAreaView>

            {/* ✅ SEARCH BAR "TREO LƠ LỬNG" 
         Sử dụng position absolute để đè lên ranh giới
      */}
            <View style={styles.floatingSearchContainer}>
                <Image
                    source={require('../assets/icon/search.png')}
                    style={{ marginLeft: 12, width: 20, height: 20, tintColor: 'rgba(0,0,0,0.45)' }}
                />
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search recipes..."
                    placeholderTextColor="#999"
                    style={styles.searchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {!!query && (
                    <Pressable onPress={() => setQuery('')} hitSlop={10} style={{ marginRight: 12 }}>
                        <Ionicons name="close-circle" size={18} color="#999" />
                    </Pressable>
                )}
            </View>
        </View>
    );
};

// ==========================================
// COMPONENT CHÍNH: HOME
// ==========================================
export default function Home() {
    const navigation = useNavigation<any>();
    const { user, token } = useAuth();

    // --- LOGIC GIỮ NGUYÊN ---
    const [greeting, setGreeting] = useState(getGreeting());
    useEffect(() => {
        const t = setInterval(() => setGreeting(getGreeting()), 60 * 1000);
        return () => clearInterval(t);
    }, []);

    const userName = (user?.fullName || '').trim();

    const [days, setDays] = useState<DayItem[]>(() => buildRollingDays());
    const [activeDayISO, setActiveDayISO] = useState(() => toISODate(new Date()));

    useEffect(() => {
        const t = setInterval(() => {
            const nowISO = toISODate(new Date());
            setDays(buildRollingDays());
            setActiveDayISO(prev => (prev ? prev : nowISO));
        }, 60 * 1000);
        return () => clearInterval(t);
    }, []);

    const MEAL_TYPES = useMemo(() => (['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const), []);
    const [activeMealType, setActiveMealType] = useState<'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks'>(
        'Breakfast'
    );

    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const [data, setData] = useState<Recipe[]>([]);
    const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const fetchHomeData = useCallback(async () => {
        setLoading(true);
        setErr(null);

        try {
            const localFav = await loadFavoriteSet(user?.id ?? null);
            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch(`${API_BASE}/recipes`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            const normalized: Recipe[] = (Array.isArray(json) ? json : []).map((x: any, idx: number) => {
                const id = x.RecipeId ?? x.recipeId ?? x.id ?? idx;
                return {
                    id,
                    title: x.Name ?? x.name ?? 'Untitled',
                    category: x.Category ?? x.category ?? 'Other',
                    subCategory: x.SubCategory ?? x.subCategory,
                    description: x.Description ?? x.description ?? '',
                    timeMinutes: x.TimeMinutes ?? x.timeMinutes,
                    calories: x.Calories ?? x.calories,
                    imageUrl: x.ImageUrl ?? x.imageUrl,
                    videoUrl: x.VideoUrl ?? x.videoUrl,
                    rating: x.AverageRating ?? x.rating ?? 4.5,
                    isLiked: x.IsLiked === 1,
                    totalLikes: x.TotalLikes ?? x.totalLikes ?? 0,
                    servings: x.Servings ?? x.servings ?? 2,
                };
            });

            let merged = new Set<number>(localFav);
            if (token) {
                for (const r of normalized) {
                    if (r.id != null && r.isLiked) merged.add(r.id);
                }
                await saveFavoriteSet(user?.id ?? null, merged);
            }

            setFavoriteIds(merged);
            setData(normalized.map(r => (r.id == null ? r : { ...r, isLiked: merged.has(r.id) })));
        } catch (e: any) {
            setErr(e?.message || 'Fetch failed');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [token, user?.id]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchHomeData();
        });
        return unsubscribe;
    }, [navigation, fetchHomeData]);

    const toggleLike = async (recipeId: number) => {
        try {
            const next = new Set<number>(favoriteIds);
            const wasLiked = next.has(recipeId);
            if (wasLiked) next.delete(recipeId);
            else next.add(recipeId);

            setFavoriteIds(next);
            await saveFavoriteSet(user?.id ?? null, next);

            setData(prev =>
                prev.map(item => {
                    if (item.id !== recipeId) return item;
                    const newLiked = !item.isLiked;
                    const base = item.totalLikes || 0;
                    const newTotal = Math.max(0, base + (newLiked ? 1 : -1));
                    return { ...item, isLiked: newLiked, totalLikes: newTotal };
                })
            );

            if (token) {
                await fetch(`${API_BASE}/favorites`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ recipeId }),
                });
            }
        } catch (error) {
            console.error('Like error:', error);
            fetchHomeData();
        }
    };

    const handleTagPress = (subCat?: string) => {
        if (!subCat) return;
        navigation.navigate('Recipes', { filterTag: subCat });
    };

    const searched = useMemo(() => {
        const k = debouncedQuery.toLowerCase();
        if (!k) return data;
        return data.filter(r => {
            const title = (r.title || '').toLowerCase();
            const desc = (r.description || '').toLowerCase();
            const cat = (r.category || '').toLowerCase();
            return title.includes(k) || desc.includes(k) || cat.includes(k);
        });
    }, [data, debouncedQuery]);

    const sectionMeals = useMemo(() => {
        const isSearching = !!debouncedQuery;
        if (isSearching) return searched.slice(0, 2);
        const c = activeMealType.toLowerCase();
        return searched.filter(r => ((r.category || '').trim().toLowerCase() === c)).slice(0, 2);
    }, [searched, activeMealType, debouncedQuery]);

    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const r of data) {
            const c = (r.category || '').trim();
            if (c) set.add(c);
        }
        const arr = Array.from(set);
        const order = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Drink', 'Dessert'];
        arr.sort((a, b) => order.indexOf(a) - order.indexOf(b));

        return arr.map((c, i) => ({
            id: `c-${i}-${c}`,
            title: c,
            image: data.find(r => (r.category || '').trim() === c)?.imageUrl,
        }));
    }, [data]);

    const popular = useMemo(() => {
        const arr = [...data];
        arr.sort((a, b) => (b.totalLikes ?? 0) - (a.totalLikes ?? 0));
        return arr.slice(0, 6);
    }, [data]);

    return (
        <View style={{ flex: 1, backgroundColor: BG }}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* ✅ HEADER MỚI */}
            <GreenHeader
                greeting={greeting}
                userName={userName}
                activeMealType={activeMealType}
                query={query}
                setQuery={setQuery}
            />

            {/* BODY */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={BRAND} />
                    <Text style={styles.centerText}>Loading...</Text>
                </View>
            ) : err ? (
                <View style={styles.center}>
                    <Text style={styles.centerText}>Error: {err}</Text>
                    <Pressable onPress={fetchHomeData} style={styles.retryBtn}>
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                </View>
            ) : (
                <ScrollView
                    // ✅ Thêm padding top 40 để tránh bị thanh search che mất
                    // ✅ Thêm padding bottom 120 để tránh bị menu che mất
                    contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={{ width: CONTENT_W, alignSelf: 'center' }}>

                        {/* DAILY MEALS */}
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionTitle}>{activeMealType}’s Plan</Text>
                        </View>

                        <FlatList
                            data={days}
                            keyExtractor={d => d.key}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ marginBottom: 16 }}
                            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                            renderItem={({ item }) => {
                                const active = activeDayISO === item.iso;
                                return (
                                    <Pressable
                                        onPress={() => setActiveDayISO(item.iso)}
                                        style={[styles.dayPill, active && styles.dayPillActive]}
                                    >
                                        <Text style={[styles.dayText, active && styles.dayTextActive]}>
                                            {item.day}
                                        </Text>
                                        <Text style={[styles.dayDate, active && styles.dayDateActive]}>
                                            {item.date}
                                        </Text>
                                    </Pressable>
                                );
                            }}
                        />

                        <View style={styles.mealTypeRow}>
                            {MEAL_TYPES.map(t => {
                                const active = t === activeMealType;
                                return (
                                    <Pressable
                                        key={t}
                                        onPress={() => {
                                            setActiveMealType(t);
                                            setQuery('');
                                        }}
                                        style={[styles.mealTypeChip, active && styles.mealTypeChipActive]}
                                    >
                                        <Text style={[styles.mealTypeText, active && styles.mealTypeTextActive]}>{t}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={{ gap: 14 }}>
                            {sectionMeals.map(m => {
                                const timeText = typeof m.timeMinutes === 'number' ? `${m.timeMinutes} mins` : '—';
                                const calText = typeof m.calories === 'number' ? `${m.calories} Cal` : '—';
                                return (
                                    <Pressable
                                        key={String(m.id)}
                                        style={({ pressed }) => [styles.mealCard, pressed && styles.cardPressed]}
                                        onPress={() => {
                                            if (m.id) navigation.navigate('RecipeDetail', { id: m.id });
                                        }}
                                    >
                                        <Image
                                            source={m.imageUrl ? { uri: m.imageUrl } : require('../assets/icon/image-placeholder.png')}
                                            style={styles.mealImg}
                                        />
                                        <View style={styles.mealContent}>
                                            <Text numberOfLines={1} style={styles.mealTitle}>
                                                {m.title || 'Untitled'}
                                            </Text>
                                            {!!m.description && <Text numberOfLines={2} style={styles.desc}>{m.description}</Text>}
                                            <View style={styles.metaRow}>
                                                <View style={styles.metaItem}>
                                                    <Image
                                                        source={require('../assets/icon/clock.png')}
                                                        style={{ width: 14, height: 14, tintColor: BRAND }}
                                                        resizeMode="contain"
                                                    />
                                                    <Text style={styles.metaText}>{timeText}</Text>
                                                </View>
                                                <View style={styles.metaItem}>
                                                    <Image
                                                        source={require('../assets/icon/Vector.png')}
                                                        style={{ width: 14, height: 14, tintColor: BRAND }}
                                                        resizeMode="contain"
                                                    />
                                                    <Text style={styles.metaText}>{calText}</Text>
                                                </View>
                                            </View>
                                        </View>
                                        <View style={styles.arrowIcon}>
                                            <Ionicons name="chevron-forward" size={18} color={BRAND} />
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Categories */}
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionTitle}>Explore Categories</Text>
                        </View>

                        <FlatList
                            data={categories}
                            keyExtractor={i => i.id}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                            renderItem={({ item }) => (
                                <Pressable
                                    style={({ pressed }) => [styles.catCard, pressed && { opacity: 0.8 }]}
                                    onPress={() => {
                                        if ((MEAL_TYPES as readonly string[]).includes(item.title)) {
                                            setActiveMealType(item.title as any);
                                            setQuery('');
                                        } else {
                                            setActiveMealType('Breakfast');
                                            setQuery(item.title);
                                        }
                                    }}
                                >
                                    <View style={styles.catImgWrap}>
                                        <Image
                                            source={item.image ? { uri: item.image } : require('../assets/icon/image-placeholder.png')}
                                            style={styles.catImg}
                                        />
                                    </View>
                                    <Text numberOfLines={1} style={styles.catText}>{item.title}</Text>
                                </Pressable>
                            )}
                            style={{ marginBottom: 12 }}
                        />

                        {/* Popular Recipes */}
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionTitle}>Popular Recipes</Text>
                        </View>

                        <View style={styles.popularGrid}>
                            {popular.map(p => {
                                const calText = typeof p.calories === 'number' ? `${p.calories} Cal` : '—';
                                const timeText = typeof p.timeMinutes === 'number' ? `${p.timeMinutes} min` : '';
                                const liked = p.id != null && favoriteIds.has(p.id);
                                return (
                                    <Pressable
                                        key={String(p.id)}
                                        style={({ pressed }) => [styles.popularCard, pressed && styles.cardPressed]}
                                        onPress={() => {
                                            if (p.id) navigation.navigate('RecipeDetail', { id: p.id });
                                        }}
                                    >
                                        <View style={styles.popularImageContainer}>
                                            <Image
                                                source={p.imageUrl ? { uri: p.imageUrl } : require('../assets/icon/image-placeholder.png')}
                                                style={styles.popularImage}
                                            />

                                            <View style={styles.popRatingBadge}>
                                                <Image
                                                    source={require('../assets/icon/Star 1.png')}
                                                    style={{ width: 10, height: 10, tintColor: '#FFC107' }}
                                                />
                                                <Text style={styles.popRatingText}>{p.rating || 4.5}</Text>
                                            </View>

                                            <TouchableOpacity
                                                style={[
                                                    styles.popHeartBtn,
                                                    liked && styles.popHeartBtnLiked,
                                                ]}
                                                activeOpacity={0.8}
                                                onPress={() => p.id && toggleLike(p.id)}
                                            >
                                                <Image
                                                    source={
                                                        liked
                                                            ? require('../assets/icon/heartfill.png')
                                                            : require('../assets/icon/heart.png')
                                                    }
                                                    style={[styles.heartIcon, liked && styles.heartIconLiked]}
                                                />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={styles.popularContent}>
                                            <Text numberOfLines={1} style={styles.popularTitle}>{p.title}</Text>

                                            {p.subCategory ? (
                                                <View style={{ alignItems: 'flex-start' }}>
                                                    <View style={styles.tagWrap}>
                                                        <Text style={styles.tagText}>{p.subCategory}</Text>
                                                    </View>
                                                </View>
                                            ) : (
                                                <View style={{ height: 20 }} />
                                            )}

                                            <View style={styles.popMetaRow}>
                                                <View style={styles.popMetaItem}>
                                                    <Image
                                                        source={require('../assets/icon/clock.png')}
                                                        style={{ width: 12, height: 12, tintColor: BRAND }}
                                                    />
                                                    <Text style={styles.popMetaText}>{timeText}</Text>
                                                </View>
                                                <View style={styles.popMetaItem}>
                                                    <Image
                                                        source={require('../assets/icon/Vector.png')}
                                                        style={{ width: 12, height: 12, tintColor: BRAND }}
                                                        resizeMode="contain"
                                                    />
                                                    <Text style={styles.popMetaText}>{calText}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

// ==========================================
// ✅ CSS ĐÃ NÂNG CẤP (Shadow, Border, Layout)
// ==========================================
const styles = StyleSheet.create({
    // --- Header Styles ---
    headerContainer: {
        height: 150, // Tăng chiều cao để chứa phần tràn
        backgroundColor: BRAND,
        borderBottomLeftRadius: 30, // Bo góc mạnh hơn
        borderBottomRightRadius: 30,
        zIndex: 10, // Quan trọng: đè lên scrollview
        position: 'relative', // Để con absolute căn theo cha
        overflow: 'visible', // Cho phép con tràn ra ngoài
    },
    headerContent: {
        width: CONTENT_W,
        alignSelf: 'center',
        paddingTop: 10,
    },
    smallHello: {
        color: '#eaf6e8',
        fontSize: 13,
        fontWeight: '600',
        opacity: 0.9,
        marginBottom: 4
    },
    bigTitle: {
        color: '#ffffff',
        fontSize: 26,
        fontWeight: '800',
        lineHeight: 34
    },

    // --- Search Bar Floating ---
    floatingSearchContainer: {
        position: 'absolute',
        bottom: -24, // Tràn ra ngoài 24px (1 nửa chiều cao 48px)
        left: 16,
        right: 16,
        height: 48,
        backgroundColor: '#fff',
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        // Shadow xịn
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8, // Android shadow
    },
    searchInput: {
        flex: 1,
        color: '#333',
        fontSize: 15,
        fontWeight: '500',
        height: '100%',
    },

    // --- Section Titles ---
    sectionHeaderRow: {
        marginTop: 24,
        marginBottom: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionTitle: { color: '#1A1A1A', fontWeight: '800', fontSize: 20 },

    // --- Day Pills ---
    dayPill: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 18,
        alignItems: 'center',
        width: 64,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#f2f2f2',
    },
    dayPillActive: {
        backgroundColor: BRAND,
        borderColor: BRAND,
        borderWidth: 0,
        // Shadow active
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    dayText: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase' },
    dayTextActive: { color: 'rgba(255,255,255,0.9)' },
    dayDate: { marginTop: 4, fontSize: 16, fontWeight: '800', color: '#333' },
    dayDateActive: { color: '#fff' },

    // --- Meal Chips ---
    mealTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    mealTypeChip: {
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 24,
        backgroundColor: '#f5f7f5',
    },
    mealTypeChipActive: { backgroundColor: BRAND },
    mealTypeText: { color: '#666', fontWeight: '700', fontSize: 13 },
    mealTypeTextActive: { color: '#fff' },

    // --- Meal Card (Horizontal) ---
    mealCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: '#fff',
        padding: 12,
        borderWidth: 1,
        borderColor: '#f0f0f0',
        // Shadow nhẹ
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    cardPressed: { transform: [{ scale: 0.98 }] },
    mealImg: {
        width: 88,
        height: 88,
        borderRadius: 16,
        marginRight: 16,
        backgroundColor: '#eee'
    },
    mealContent: { flex: 1, justifyContent: 'center', gap: 6 },
    mealTitle: { color: BRAND2, fontWeight: '800', fontSize: 16 },
    desc: { color: '#777', fontSize: 13, lineHeight: 18 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: BRAND, fontSize: 12, fontWeight: '600' },
    arrowIcon: {
        width: 32, height: 32, borderRadius: 12, backgroundColor: '#f5f9f5',
        alignItems: 'center', justifyContent: 'center'
    },

    // --- Category Card ---
    catCard: { width: 84, alignItems: 'center', gap: 8 },
    catImgWrap: {
        width: 76, height: 76, borderRadius: 26, backgroundColor: '#f7f7f7',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
    },
    catImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    catText: { fontSize: 12, color: '#333', fontWeight: '700' },

    // --- Popular Grid ---
    popularGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between', // Đẩy sang 2 bên
        gap: GAP, // Khoảng cách đều
    },
    popularCard: {
        width: ITEM_WIDTH, // Chia đều
        backgroundColor: '#fff',
        borderRadius: 22,
        padding: 10,
        marginBottom: 0, // Khoảng cách dưới
        // Shadow nổi
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    popularImageContainer: {
        position: 'relative',
        height: 136, // Ảnh cao hơn
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 10,
    },
    popularImage: { width: '100%', height: '100%', resizeMode: 'cover' },

    // Rating Badge
    popRatingBadge: {
        position: 'absolute', top: 10, left: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 10, gap: 4
    },
    popRatingText: { fontSize: 11, fontWeight: '800', color: '#1A1A1A' },

    // Heart Button
    popHeartBtn: {
        position: 'absolute', top: 10, right: 10,
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 2
    },
    popHeartBtnLiked: { backgroundColor: '#fff' },
    heartIcon: { width: 18, height: 18, tintColor: HEART },
    heartIconLiked: { transform: [{ scale: 1.1 }], tintColor: '#FF3B30' },

    popularContent: { paddingHorizontal: 2 },
    popularTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },

    tagWrap: {
        backgroundColor: '#eaf6e8', paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 6, marginBottom: 8
    },
    tagText: { color: BRAND, fontSize: 10, fontWeight: '700' },

    popMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    popMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    popMetaText: { fontSize: 11, color: BRAND, fontWeight: '600' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
    centerText: { fontWeight: '700', color: '#666', textAlign: 'center' },
    retryBtn: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: BRAND },
    retryText: { color: '#fff', fontWeight: '900' },
});