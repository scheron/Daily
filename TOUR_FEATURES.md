# Новые возможности системы туров

## 🎯 Решенные проблемы

### 1. ✅ Убрали ненужные директивы
- Удалили `/directives/tour.ts` 
- Убрали регистрацию из `main.ts`
- Система стала проще и практичнее

### 2. ✅ Множественные туры
```javascript
// Регистрация туров
const welcomeTour = createTour('welcome').name('Добро пожаловать').build()
const featureTour = createTour('features').name('Новые функции').build()

tour.registerTour(welcomeTour)
tour.registerTour(featureTour)

// Запуск по ID
tour.startById('welcome')
tour.startById('features')
```

### 3. ✅ Динамические интерактивные туры
```javascript
const interactiveTour = createTour('interactive')
  .addStep({
    id: 'wait-for-click',
    target: '#button',
    title: 'Нажмите кнопку',
    description: 'Нажмите на кнопку для продолжения',
    waitForAction: true, // Скрывает кнопку "Далее"
    onUserAction: async (actionType) => {
      console.log('Пользователь выполнил:', actionType)
    }
  })
  .addStep({
    id: 'after-click',
    target: '#new-element',
    title: 'Появился новый элемент!',
    description: 'Теперь мы можем его показать',
    beforeShow: async () => {
      // Ждем появления элемента
      await tour.waitForElement('#new-element')
    }
  })
  .build()
```

## 🛠️ Новые API методы

### Tour Store
- `registerTour(config)` - регистрирует тур
- `startTourById(id)` - запускает тур по ID  
- `proceedToNextStep()` - принудительно переходит дальше
- `notifyUserAction(action, data)` - уведомляет о действии пользователя

### Tour Composable
- `startById(id)` - запуск по ID
- `proceedNext()` - принудительный переход
- `notifyAction(action, data)` - уведомление о действии
- `registerTour(config)` - регистрация тура

### Новые свойства шагов
```typescript
interface TourStep {
  waitForAction?: boolean     // Скрывает кнопку "Далее"
  interactive?: boolean       // Скрывает все кнопки навигации  
  canProceed?: () => boolean  // Проверка возможности перехода
  onUserAction?: (action: string, data?: any) => void // Обработчик действий
}
```

## 🎭 Практические примеры

### 1. Тур ожидания действия
```javascript
const stepWithAction = {
  id: 'click-button',
  target: '#my-button', 
  title: 'Нажмите кнопку',
  description: 'Кликните по кнопке, чтобы продолжить',
  waitForAction: true, // Кнопка "Далее" скрыта
}

// В компоненте с кнопкой:
function handleButtonClick() {
  tour.notifyAction('button-clicked')
  // Тур автоматически перейдет к следующему шагу
}
```

### 2. Полностью интерактивный шаг
```javascript
const interactiveStep = {
  id: 'fill-form',
  target: '#form',
  title: 'Заполните форму',
  description: 'Введите данные в форму',
  interactive: true, // Все кнопки навигации скрыты
  canProceed: () => {
    return form.isValid() // Проверяем валидность формы
  }
}
```

### 3. Динамическое появление элементов
```javascript
const dynamicStep = {
  id: 'dynamic-element',
  target: '#editor',
  title: 'Редактор задач',
  description: 'Этот элемент появился динамически',
  beforeShow: async () => {
    // Ждем появления элемента до 5 секунд
    await tour.waitForElement('#editor', 5000)
  }
}
```

## 🎮 Демонстрация

В HelpPanel добавлены две кнопки:
- **"Базовый тур"** - стандартный welcome тур
- **"Интерактивный тур"** - демонстрация новых возможностей

Интерактивный тур:
1. Показывает кнопку "Создать задачу" без кнопки "Далее"
2. Ждет клика пользователя
3. После клика автоматически переходит к редактору
4. Показывает редактор с обычной навигацией

## 🔧 Интеграция

### Уведомление о действиях пользователя
```javascript
// В любом компоненте
import { useTour } from '@/composables/useTour'

const tour = useTour()

function handleUserAction() {
  // Уведомляем тур о действии
  tour.notifyAction('specific-action', { data: 'optional' })
  
  // Остальная логика компонента
  doSomething()
}
```

### Регистрация и запуск туров
```javascript
// Регистрируем туры при инициализации
const tours = [
  createWelcomeTour(),
  createFeatureTour(),
  createAdvancedTour()
]

tours.forEach(tour.registerTour)

// Запускаем нужный тур
tour.startById('welcome')    // Для новых пользователей
tour.startById('features')   // Для обновлений
tour.startById('advanced')   // Для опытных пользователей
```

## ✨ Результат

Теперь система туров поддерживает:
- ✅ **Множественные туры** - разные туры для разных сценариев
- ✅ **Интерактивность** - туры реагируют на действия пользователя  
- ✅ **Динамичность** - элементы могут появляться во время тура
- ✅ **Гибкость** - полный контроль над навигацией и логикой
- ✅ **Простоту** - убрали ненужную сложность директив

Система готова для создания современных интерактивных обучающих туров! 🚀
