import React, { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

export interface BreadcrumbSegment {
  id: string
  name: string
}

interface Props {
  segments: BreadcrumbSegment[]
  onSegmentPress: (index: number) => void
}

export const Breadcrumb = ({ segments, onSegmentPress }: Props) => {
  const theme = useTheme()
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0)
    return () => clearTimeout(id)
  }, [segments])

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1
          return (
            <View key={segment.id} style={styles.segmentWrapper}>
              <Pressable
                disabled={isLast}
                onPress={() => onSegmentPress(index)}
                accessibilityRole="button"
              >
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.segment,
                    isLast ? styles.current : null,
                    { color: isLast ? theme.colors.onSurface : theme.colors.primary }
                  ]}
                >
                  {segment.name}
                </Text>
              </Pressable>
              {!isLast ? (
                <Text style={[styles.separator, { color: theme.colors.onSurfaceVariant }]}>/</Text>
              ) : null}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8, paddingHorizontal: 16 },
  segmentWrapper: { flexDirection: 'row', alignItems: 'center' },
  segment: { paddingHorizontal: 4 },
  current: { fontWeight: '700' },
  separator: { paddingHorizontal: 4 }
})
