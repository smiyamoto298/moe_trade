<?php

namespace Database\Seeders;

use App\Models\BonusEffectType;
use Illuminate\Database\Seeder;

class BonusEffectTypeSeeder extends Seeder
{
    public function run(): void
    {
        $data = [
            // attack
            ['type_key' => 'phys_dmg_up',       'label' => '物理ダメージ増加',     'category' => 'attack'],
            ['type_key' => 'magic_dmg_up',       'label' => '魔法ダメージ増加',     'category' => 'attack'],
            ['type_key' => 'critical_rate_up',   'label' => 'クリティカル率上昇',   'category' => 'attack'],
            ['type_key' => 'atk_delay_down',     'label' => '攻撃ディレイ短縮',     'category' => 'attack'],
            ['type_key' => 'skill_delay_down',   'label' => 'スキルディレイ短縮',   'category' => 'attack'],
            ['type_key' => 'cast_speed_up',      'label' => '詠唱速度短縮',         'category' => 'attack'],
            ['type_key' => 'mp_cost_down',       'label' => 'MP消費軽減',           'category' => 'attack'],
            ['type_key' => 'mag_to_atk',         'label' => '魔力→攻撃力変換',     'category' => 'attack'],
            // magic
            ['type_key' => 'magic_skill_up',     'label' => '魔法スキル効果上昇',   'category' => 'magic'],
            ['type_key' => 'fire_attr_up',       'label' => '火属性強化',           'category' => 'magic'],
            ['type_key' => 'water_attr_up',      'label' => '水属性強化',           'category' => 'magic'],
            ['type_key' => 'wind_attr_up',       'label' => '風属性強化',           'category' => 'magic'],
            ['type_key' => 'earth_attr_up',      'label' => '地属性強化',           'category' => 'magic'],
            ['type_key' => 'none_attr_up',       'label' => '無属性強化',           'category' => 'magic'],
            ['type_key' => 'all_attr_up',        'label' => '全属性強化',           'category' => 'magic'],
            // defense
            ['type_key' => 'phys_dmg_reduce',    'label' => '物理ダメージ軽減',     'category' => 'defense'],
            ['type_key' => 'magic_dmg_reduce',   'label' => '魔法ダメージ軽減',     'category' => 'defense'],
            ['type_key' => 'phys_dmg_reflect',   'label' => '物理ダメージ反射',     'category' => 'defense'],
            ['type_key' => 'magic_reflect',      'label' => '魔法反射',             'category' => 'defense'],
            ['type_key' => 'def_up',             'label' => '防御力上昇',           'category' => 'defense'],
            ['type_key' => 'all_res_up',         'label' => '全属性耐性上昇',       'category' => 'defense'],
            ['type_key' => 'status_null',        'label' => '状態異常無効',         'category' => 'defense'],
            ['type_key' => 'auto_revive',        'label' => '自動復活',             'category' => 'defense'],
            // recovery
            ['type_key' => 'hp_regen',           'label' => 'HP自然回復',           'category' => 'recovery'],
            ['type_key' => 'st_regen',           'label' => 'ST自然回復',           'category' => 'recovery'],
            ['type_key' => 'mp_regen',           'label' => 'MP自然回復',           'category' => 'recovery'],
            ['type_key' => 'hpstmp_regen',       'label' => 'HP/ST/MP同時回復',     'category' => 'recovery'],
            ['type_key' => 'atk_absorb',         'label' => '攻撃時吸収',           'category' => 'recovery'],
            // skill
            ['type_key' => 'battle_skill_up',    'label' => '戦闘技術スキル上昇',   'category' => 'skill'],
            ['type_key' => 'martial_skill_up',   'label' => '格闘系スキル上昇',     'category' => 'skill'],
            ['type_key' => 'music_skill_up',     'label' => '音楽スキル上昇',       'category' => 'skill'],
            ['type_key' => 'dance_skill_up',     'label' => 'ダンススキル上昇',     'category' => 'skill'],
            ['type_key' => 'shout_skill_up',     'label' => 'シャウトスキル上昇',   'category' => 'skill'],
            ['type_key' => 'tame_skill_up',      'label' => '調教スキル上昇',       'category' => 'skill'],
            ['type_key' => 'pet_growth_up',      'label' => 'ペット成長率上昇',     'category' => 'skill'],
            ['type_key' => 'special_skill',      'label' => '専用技解放',           'category' => 'skill'],
            // speed
            ['type_key' => 'move_speed_up',      'label' => '移動速度上昇',         'category' => 'speed'],
            ['type_key' => 'jump_up',            'label' => 'ジャンプ力強化',       'category' => 'speed'],
            ['type_key' => 'water_speed_up',     'label' => '水中移動速度上昇',     'category' => 'speed'],
            ['type_key' => 'water_breath',       'label' => '水中呼吸',             'category' => 'speed'],
            ['type_key' => 'fall_dmg_reduce',    'label' => '落下ダメージ軽減',     'category' => 'speed'],
            // production
            ['type_key' => 'weight_reduce',      'label' => '重量軽減',             'category' => 'production'],
            ['type_key' => 'max_weight_up',      'label' => '最大重量増加',         'category' => 'production'],
            ['type_key' => 'all_stat_up',        'label' => '全ステータス上昇',     'category' => 'production'],
            ['type_key' => 'race_bonus',         'label' => '特定種族特攻',         'category' => 'production'],
            ['type_key' => 'prod_mg_up',         'label' => '生産MGマス増加',       'category' => 'production'],
            ['type_key' => 'prod_hg_up',         'label' => '生産HGマス増加',       'category' => 'production'],
            // misc
            ['type_key' => 'transform',          'label' => '変身',                 'category' => 'misc'],
            ['type_key' => 'motion_change',      'label' => 'モーション変化',       'category' => 'misc'],
            ['type_key' => 'item_delay_down',    'label' => 'アイテム使用ディレイ短縮', 'category' => 'misc'],
        ];

        foreach ($data as $row) {
            BonusEffectType::firstOrCreate(['type_key' => $row['type_key']], $row);
        }
    }
}
