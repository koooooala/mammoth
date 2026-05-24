import { Tabs } from 'expo-router';
import { Colors, Typography } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconActive]}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? Colors.ink : Colors.inkLight}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.inkLight,
      }}
    >
      <Tabs.Screen
        name="input"
        options={{
          title: '录入',
          tabBarIcon: ({ focused }) => <TabIcon name="add-circle-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="staging"
        options={{
          title: '暂存',
          tabBarIcon: ({ focused }) => <TabIcon name="layers-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: '账本',
          tabBarIcon: ({ focused }) => <TabIcon name="book-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: '总览',
          tabBarIcon: ({ focused }) => <TabIcon name="bar-chart-outline" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: '我',
          tabBarIcon: ({ focused }) => <TabIcon name="person-outline" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.creamLight,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 80,
    paddingBottom: 16,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.medium,
  },
  iconWrap: {
    width: 38,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  iconActive: {
    backgroundColor: Colors.creamMid,
  },
});
