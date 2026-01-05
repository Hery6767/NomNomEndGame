// navigations/Tabs.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Home from '../src/home';
import Meals from '../src/meals';
import List from '../src/list';
import Recipes from '../src/recipes';
import Profile from '../src/profile';
import { COLORS } from '../style/colors';
const { BRAND, BRAND3 } = COLORS;

export type BottomTabParamList = {
    Home: undefined;
    Meals: undefined;
    Grocery: undefined;
    Recipes: undefined;
    Profile: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

// =====================
// TÙY CHỈNH NHANH Ở ĐÂY
// =====================
const BAR_BASE_HEIGHT = 66;        // chỉnh "độ cao thanh menu" (chưa tính safe area)
const BAR_PADDING_TOP = 10;

const INDICATOR_HEIGHT = 56;       // pill cao
const INDICATOR_MARGIN_H = 10;     // pill cách mép tab mỗi bên
const INDICATOR_TOP = 8;           // pill cách top của bar

const ICON_ANIM_DURATION = 220;    // chuyển icon chậm/nhanh
const INDICATOR_SPRING = {
    // ✅ chậm hơn + mượt + hạn chế "nẩy"
    stiffness: 85,
    damping: 18,
    mass: 1.15,
    overshootClamping: true,
    restDisplacementThreshold: 0.5,
    restSpeedThreshold: 0.5,
};

// Nhấc lên / scale nhẹ khi active (nếu không muốn -> set false)
const ENABLE_LIFT_SCALE = true;
const LIFT_Y = -2;     // nhấc lên bao nhiêu px
const SCALE_ON = 1.08; // scale khi active

function MyTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const [barW, setBarW] = useState(0);

    const routes = state.routes;
    const count = routes.length;

    // mỗi tab chiếm đều chiều rộng
    const tabW = barW > 0 ? barW / count : 0;
    // pill width = tabW - 2*margin
    const indicatorW = tabW > 0 ? tabW - 14 : 0;
    const offsetX = tabW > 0 ? (tabW - indicatorW) / 2 : 0;



    // chạy pill
    const translateX = useRef(new Animated.Value(0)).current;

    // animation cho icon (0..1) mỗi tab
    const focusAnim = useRef<Animated.Value[]>([]).current;

    // icon map: off/on
    const icons = useMemo(
        () => ({
            Home: {
                off: require('../assets/icon/home.png'),
                on: require('../assets/icon/homefill.png'),
            },
            Meals: {
                off: require('../assets/icon/Cal.png'),
                on: require('../assets/icon/Calfill.png'),
            },
            Grocery: {
                off: require('../assets/icon/bag.png'),
                on: require('../assets/icon/bagfill.png'),
            },
            Recipes: {
                off: require('../assets/icon/hatcook.png'),
                on: require('../assets/icon/hatcookfill.png'),
            },
            Profile: {
                off: require('../assets/icon/user.png'),
                on: require('../assets/icon/userfill.png'),
            },
        }),
        []
    );

    // init focusAnim đủ số tab (khi mount / thay đổi routes)
    useEffect(() => {
        if (focusAnim.length !== routes.length) {
            focusAnim.splice(0, focusAnim.length);
            routes.forEach((_, i) => focusAnim.push(new Animated.Value(i === state.index ? 1 : 0)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routes.length]);

    // animate khi đổi tab: pill + icon
    useEffect(() => {
        if (!tabW) return;

        // 1) pill chạy
        const toValue = state.index * tabW + offsetX;

        Animated.spring(translateX, {
            toValue,
            useNativeDriver: true,
            stiffness: 140,
            damping: 16,
            mass: 1.2,
            overshootClamping: false,
            restDisplacementThreshold: 0.5,
            restSpeedThreshold: 0.5,
        }).start();

        // 2) icon crossfade + lift/scale nhẹ
        routes.forEach((_, i) => {
            const v = focusAnim[i];
            if (!v) return;

            Animated.timing(v, {
                toValue: state.index === i ? 1 : 0,
                duration: ICON_ANIM_DURATION,
                useNativeDriver: true,
            }).start();
        });
    }, [state.index, tabW, offsetX, translateX, routes, focusAnim]);

    return (
        <View
            style={[
                styles.tabBar,
                {
                    height: BAR_BASE_HEIGHT + insets.bottom,
                    paddingBottom: insets.bottom,
                    paddingTop: BAR_PADDING_TOP,
                },
            ]}
            onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        >
            {/* pill chạy phía sau */}
            {tabW > 0 && (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.indicator,
                        {
                            top: INDICATOR_TOP,
                            width: indicatorW,
                            height: INDICATOR_HEIGHT,
                            transform: [{ translateX }],
                        },
                    ]}
                />
            )}

            {routes.map((route, index) => {
                const { options } = descriptors[route.key];

                const label =
                    options.tabBarLabel !== undefined
                        ? (options.tabBarLabel as string)
                        : options.title !== undefined
                            ? options.title
                            : route.name;

                const focused = state.index === index;

                const onPress = () => {
                    const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name as never);
                    }
                };

                const v = focusAnim[index] || new Animated.Value(focused ? 1 : 0);

                // crossfade icon
                const onOpacity = v;
                const offOpacity = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

                // lift / scale nhẹ (tuỳ chọn)
                const lift = ENABLE_LIFT_SCALE
                    ? v.interpolate({ inputRange: [0, 1], outputRange: [0, LIFT_Y] })
                    : 0;

                const scale = ENABLE_LIFT_SCALE
                    ? v.interpolate({ inputRange: [0, 1], outputRange: [1, SCALE_ON] })
                    : 1;

                return (
                    <Pressable
                        key={route.key}
                        onPress={onPress}
                        style={({ pressed }) => [
                            styles.tabItem,
                            { width: tabW || undefined },
                            pressed && { opacity: 0.85 },
                        ]}
                    >
                        <Animated.View style={{ transform: [{ translateY: lift as any }, { scale: scale as any }] }}>
                            <View style={styles.iconWrap}>
                                {/* OFF icon */}
                                <Animated.Image
                                    source={(icons as any)[route.name]?.off}
                                    style={[
                                        styles.iconLayer,
                                        {
                                            opacity: offOpacity,
                                            tintColor: BRAND,
                                        },
                                    ]}
                                />
                                {/* ON icon */}
                                <Animated.Image
                                    source={(icons as any)[route.name]?.on}
                                    style={[
                                        styles.iconLayer,
                                        {
                                            opacity: onOpacity,
                                        },
                                    ]}
                                />
                            </View>
                        </Animated.View>

                        <Text
                            style={[
                                styles.label,
                                { color: focused ? '#fff' : BRAND },
                            ]}
                            numberOfLines={1}
                        >
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function Tabs() {
    return (
        <Tab.Navigator
            tabBar={(props) => <MyTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tab.Screen name="Home" component={Home} options={{ tabBarLabel: 'Home' }} />
            <Tab.Screen name="Meals" component={Meals} options={{ tabBarLabel: 'Meals' }} />
            <Tab.Screen name="Grocery" component={List} options={{ tabBarLabel: 'Grocery' }} />
            <Tab.Screen name="Recipes" component={Recipes} options={{ tabBarLabel: 'Recipes' }} />
            <Tab.Screen name="Profile" component={Profile} options={{ tabBarLabel: 'Profile' }} />
        </Tab.Navigator>
    );
}

const styles = StyleSheet.create({
    tabBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,

        backgroundColor: BRAND3,
        borderTopWidth: 0,

        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',

        // shadow
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
    },

    indicator: {
        position: 'absolute',
        left: 0,
        borderRadius: 30,
        backgroundColor: BRAND,
        zIndex: 0,
    },

    tabItem: {
        height: 62,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        zIndex: 1,
    },

    iconWrap: {
        width: 20,
        height: 20,
    },
    iconLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 20,
        height: 20,
    },

    label: {
        fontSize: 11,
        fontWeight: '700',
    },
});
