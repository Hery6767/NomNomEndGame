// navigations/stack.tsx
import React from 'react';
import {
    createStackNavigator,
    TransitionPresets, // ✅ Import cái này để dùng hiệu ứng chuẩn
} from '@react-navigation/stack';

import { useAuth } from '../auth/AuthContext';

import OnBoard from '../src/onBoard';
import LogIn from '../src/logIn';
import Register from '../src/register';
import Tabs from './tab';
import SocketTest from '../src/SocketTest';
import RecipeDetailScreen from '../src/recipe-detail';
import RecipeCreateScreen from '../src/recipe-create';
import InforUser from '../src/inforUser';

export type RootStackParamList = {
    OnBoard: undefined;
    LogIn: undefined;
    Register: undefined;
    Home: undefined; // Home = Tabs
    SocketTest: undefined;
    RecipeCreate: undefined;
    RecipeDetail: { id: number };
    InforUser: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function MainStack() {
    const { user, restoring } = useAuth();

    console.log('User changed:', user);

    if (restoring) return null;

    const isAuthed = !!user;

    return (
        <Stack.Navigator
            // Remount khi user đổi để reset navigation state (fix kẹt logout)
            key={isAuthed ? 'app' : 'auth'}
            initialRouteName={isAuthed ? 'Home' : 'OnBoard'}
            screenOptions={{
                headerShown: false,
                // ✅ Thêm dòng này: Tất cả các trang sẽ có hiệu ứng trượt mượt mà
                ...TransitionPresets.SlideFromRightIOS,
            }}
        >
            {isAuthed ? (
                <>
                    <Stack.Screen name="Home" component={Tabs} />
                    <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
                    <Stack.Screen name="RecipeCreate" component={RecipeCreateScreen} />
                    <Stack.Screen name="InforUser" component={InforUser} />
                    <Stack.Screen name="SocketTest" component={SocketTest} />
                </>
            ) : (
                <>
                    <Stack.Screen name="OnBoard" component={OnBoard} />
                    <Stack.Screen name="LogIn" component={LogIn} />
                    <Stack.Screen name="Register" component={Register} />
                </>
            )}
        </Stack.Navigator>
    );
}