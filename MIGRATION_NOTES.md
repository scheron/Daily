# Миграция на новую систему туров

## Что изменилось

### ✅ **Заменено**
- `useTour` - обновлен с новым API
- `tour.store.ts` - добавлен Builder pattern
- `TourStep` компонент - поддерживает новые типы

### ➕ **Добавлено**  
- **Типы** `/types/tour.ts` - полная типизация
- **Builder** `/utils/tour-builder.ts` - удобное создание туров
- **Директивы** `/directives/tour.ts` - v-tour, v-tour-step, v-tour-highlight
- **Новые composables** - useTourBuilder, useTourScenarios, useTourHelpers

### 🔧 **Изменения в API**

**Было:**
```javascript
const {isTourActive, currentTourStep, nextStep} = useTour()
```

**Стало:**
```javascript
const tour = useTour()
tour.isActive.value
tour.currentTourStep.value  
tour.next()
```

### 📋 **Новые возможности**

1. **Builder Pattern:**
```javascript
createTour('my-tour')
  .name('Мой тур')
  .addStep(quickStep('step1', '#element', 'Заголовок', 'Описание'))
  .build()
```

2. **Директивы:**
```vue
<button v-tour="'my-button'">Кнопка</button>
```

3. **Быстрые туры:**
```javascript
quickDemo('#element', 'Заголовок', 'Описание')
```

## Совместимость

✅ Все существующие туры работают без изменений  
✅ Spotlight и позиционирование не изменились  
✅ Все data-tour атрибуты остались те же

## Следующие шаги

Теперь можно:
- Использовать директивы вместо data-tour атрибутов
- Создавать условные и интерактивные туры
- Легко добавлять новые туры с Builder API
