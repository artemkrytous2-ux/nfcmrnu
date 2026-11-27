# NFCMENU — безопасные поэтапные миграции

**Статус:** подготовлены по коду и SQL-репозиторию. **Не проверены на вашей живой базе Supabase.**  
Существующие файлы в `supabase/*.sql` и код приложения **не изменяются**.  
Эти скрипты — отдельный безопасный контур.

## Правила

1. Первый файл всегда `00-preflight.sql` — только диагностика, без изменений.
2. Дальше — только те файлы, которые preflight пометил как `MISSING` (или `WARN` после ручного решения).
3. Не запускайте старые монолитные `schema.sql` / `superadmin.sql` / `archive.sql` на рабочей базе «целиком», если preflight показывает, что ядро уже есть.
4. Запрещено: `DROP TABLE`, `TRUNCATE`, массовый `DELETE`, удаление данных.
5. Политики Storage переписываются только в `40-storage-menu-photos-widen.sql` и **только с расширением** путей (`banner|products|pwa-icon|portfolio`), без сужения.

## Граф зависимостей

```
00-preflight.sql                         (всегда первым, READ-ONLY)

10-require-core.sql                      (жёсткая проверка ядра; без CREATE)

20-add-sub-description.sql               ← businesses
21-add-order-call-settings.sql           ← businesses
22-add-theme.sql                         ← businesses
23-add-business-kind.sql                 ← businesses
24-add-business-kind-protection.sql      ← kind + is_superadmin()
25-add-is-archived.sql                   ← businesses (+ soft-update lock_business_identity если есть)
26-add-pwa-columns.sql                   ← businesses (без Storage)
27-add-pwa-prompt.sql                    ← businesses

30-portfolio-table.sql                   ← businesses + is_superadmin + current_business_id
                                         (таблица RLS; без Storage)

40-storage-menu-photos-widen.sql         ← bucket menu-photos + current_business_id + is_superadmin
                                         (расширяет пути; не трогает activation-media)

50-activation-requests.sql               ← set_updated_at + is_superadmin + businesses
51-business-subscriptions.sql            ← activation_requests + businesses + is_superadmin
52-activation-media-bucket.sql           ← activation_requests (+ is_superadmin)
                                         (только bucket activation-media)
```

## Порядок запуска

| # | Файл | Когда запускать |
|---|---|---|
| 1 | `00-preflight.sql` | Всегда. Сохраните результат. |
| 2 | `10-require-core.sql` | Перед любыми изменениями. Если ошибка — **стоп**, ядро неполное. |
| 3 | `20` … `27` | Только колонки/триггеры со статусом MISSING в preflight. |
| 4 | `30-portfolio-table.sql` | Если нет таблицы `portfolio_photos`. |
| 5 | `40-storage-menu-photos-widen.sql` | Если preflight: нет папки в политиках / WARN по путям. |
| 6 | `50` → `51` → `52` | Если нет заявок / подписок / bucket activation-media. |
| 7 | Повтор `00-preflight.sql` | Контроль: критичных MISSING не должно остаться. |

## Что сознательно НЕ входит в этот контур

- Полное создание ядра (`businesses`/`categories`/`products`/`orders`) — это зона `schema.sql` и только для пустой/новой БД.
- Полный перенос всех политик из `superadmin.sql` / `archive.sql` одним файлом — слишком рискованно на рабочей базе; preflight покажет пробелы для ручного решения.
- `storage-rls-probe.sql` — не использовать.

## После каждого этапа

Смотрите блок «ПРОВЕРКА» в конце файла (SELECT). При `RAISE EXCEPTION` транзакция в SQL Editor откатывается — данные не должны пострадать, если вы не смешивали скрипт с другими DML вручную.
