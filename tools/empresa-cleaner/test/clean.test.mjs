import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTPUT_COLUMNS,
  formatDebt,
  formatRegimeHistory,
  isValidCnpj,
  normalizeAddress,
  normalizeEmail,
  normalizePartner,
  normalizePartnerEntries,
  normalizePartners,
  normalizeRegime,
  parseDebtAmount,
  selectTopPartners,
} from '../src/clean.mjs';

test('valida e rejeita CNPJs pelo dígito verificador', () => {
  assert.equal(isValidCnpj('67.960.100/0001-30'), true);
  assert.equal(isValidCnpj('67.960.100/0001-31'), false);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
});

test('consolida o endereço sem partes vazias', () => {
  assert.equal(
    normalizeAddress({
      tipo: 'RUA',
      endereco: 'São Roque',
      numero: '121',
      complemento: 'Sala 2',
    }),
    'RUA São Roque, 121 - Sala 2',
  );
});

test('normaliza contato e nome de sócio', () => {
  assert.equal(normalizeEmail('  CONTATO@EXEMPLO.COM.BR '), 'contato@exemplo.com.br');
  assert.equal(normalizeEmail('email-invalido'), null);
  assert.equal(normalizePartner('PF- SANDRA MARIA-'), 'SANDRA MARIA');
  assert.deepEqual(
    normalizePartners('SANDRA MARIA-JOSE SILVA-', 'PF-PF-'),
    ['SANDRA MARIA', 'JOSE SILVA'],
  );
});

test('limita a cinco sócios e prioriza cargos de gestão', () => {
  const entries = normalizePartnerEntries(
    'SOCIO UM-SOCIO DOIS-SOCIO TRES-SOCIO QUATRO-SOCIO CINCO-SOCIO DIRETOR-',
    'PF-PF-PF-PF-PF-PF-',
    'SOCIO-SOCIO-SOCIO-SOCIO-SOCIO-DIRETOR-',
  );
  assert.deepEqual(
    selectTopPartners(entries).map(({ name }) => name),
    ['SOCIO DIRETOR', 'SOCIO UM', 'SOCIO DOIS', 'SOCIO TRES', 'SOCIO QUATRO'],
  );
});

test('normaliza regimes sem inventar classificação ambígua', () => {
  assert.deepEqual(normalizeRegime('SIMPLES NACIONAL'), {
    current: 'Simples Nacional',
    history: 'Simples Nacional',
    ambiguous: false,
  });
  assert.deepEqual(normalizeRegime('PRESUMIDO OU LUCRO REAL'), {
    current: null,
    history: 'PRESUMIDO OU LUCRO REAL',
    ambiguous: true,
  });
});

test('remove ANO do histórico de regime', () => {
  assert.equal(
    formatRegimeHistory('ANO 2023 LUCRO REAL, ANO 2024 LUCRO REAL, '),
    '2024 - Lucro Real; 2023 - Lucro Real',
  );
  assert.equal(
    formatRegimeHistory('ANO 2016 LUCRO REAL, ANO 2017 LUCRO REAL, ANO 2018 LUCRO REAL, ANO 2019 LUCRO REAL, ANO 2020 LUCRO REAL, ANO 2021 LUCRO REAL, ANO 2022 LUCRO REAL, ANO 2023 LUCRO REAL, ANO 2024 LUCRO REAL,'),
    '2024 - Lucro Real; 2023 - Lucro Real; 2022 - Lucro Real; 2021 - Lucro Real; 2020 - Lucro Real',
  );
  assert.equal(
    normalizeRegime('ANO 2023 LUCRO REAL, ANO 2024 LUCRO REAL, ').history,
    '2024 Lucro Real; 2023 Lucro Real',
  );
});

test('normaliza dívida como moeda brasileira', () => {
  assert.equal(parseDebtAmount('R$2855,35'), 2855.35);
  assert.equal(formatDebt('R$2855,35'), 'R$ 2.855,35');
  assert.equal(formatDebt('R$'), null);
});

test('perfil enxuto termina em data_inicio', () => {
  assert.deepEqual(OUTPUT_COLUMNS, [
    'cnpj',
    'razao_social',
    'nome_fantasia',
    'situacao',
    'endereco',
    'bairro',
    'cidade',
    'estado',
    'cep',
    'telefone',
    'email',
    'cnae_codigo',
    'cnae_descricao',
    'regime_historico',
    'socios',
    'data_inicio',
  ]);
});
