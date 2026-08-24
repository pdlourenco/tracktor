-- Heal databases seeded before the unitOfLpg fix: the config was inserted as
-- 'litre', but the settings schema only accepts 'liter', which blocked every
-- settings update until the value was corrected by hand.
UPDATE `configs` SET `value` = 'liter', `updated_at` = CURRENT_TIMESTAMP WHERE `key` = 'unitOfLpg' AND `value` = 'litre';
