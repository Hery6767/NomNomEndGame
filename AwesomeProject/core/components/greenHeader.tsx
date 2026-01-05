// components/greenHeader.tsx
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
    backgroundColor: string;
    height?: number;
    style?: ViewStyle;
    children?: React.ReactNode;
};

export default function GreenHeaderBG({
    backgroundColor,
    height = 150,
    style,
    children,
}: Props) {
    return (
        <View
            style={[
                styles.wrap,
                { backgroundColor, height },
                style,
            ]}
        >
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                {children}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        overflow: 'hidden',
    },
});
