-- Import legacy CEO Brain deals
BEGIN;

-- Soft-delete existing deals in funnel
UPDATE opportunities SET deleted_at = now(), updated_at = now()
WHERE organization_id = '19a2d40b-36ea-4668-8941-6496ecf7df67' AND funnel_id = 'f6ff0447-3d5d-4d66-88d4-ac434a01b578' AND deleted_at IS NULL;

UPDATE contacts SET deleted_at = now(), updated_at = now()
WHERE organization_id = '19a2d40b-36ea-4668-8941-6496ecf7df67' AND deleted_at IS NULL
AND id IN (
  SELECT contact_id FROM opportunities
  WHERE organization_id = '19a2d40b-36ea-4668-8941-6496ecf7df67' AND funnel_id = 'f6ff0447-3d5d-4d66-88d4-ac434a01b578'
);

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AFRY BRASIL LTDA.', 'AFRY BRASIL',
    '50648468003008', 'rogerio.arriel@poyry.com.br', '(11) 3472-6357',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AFRY BRASIL', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ALIMENTTA RESTAURANTES EMPRESARIAIS LTDA', 'ALIMENTTA',
    '09430324009271', 'gilnei@alimentta.net', '(51) 3371-2180',
    'Marcelo de Carvalho Heineck', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Marcelo de Carvalho Heineck","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ALIMENTTA', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ANDRITZ BRASIL LTDA', 'ANDRITZ BR',
    '62420534001600', 'abl.cadastro@andritz.com', '(41) 2103-7665',
    'Luiz Mário Bordini', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Luiz Mário Bordini","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'ANDRITZ BR', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AUTOPORT TRANSPORTES E LOGISTICA LTDA.', 'AUTOPORT',
    '07677731001944', NULL, '(27) 2125-1800',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'AUTOPORT', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BBM LOGISTICA S.A', 'BBM LOGISTICA',
    '01107327000391', 'regulatorio@bbmlogistica.com.br', '(41) 2169-0055',
    'Marcos Battistela', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Marcos Battistela","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BBM LOGISTICA', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BRAZUL TRANSPORTE DE VEICULOS LTDA', 'BRAZUL TRANSPORTES',
    '60395589002220', 'cscfiscal.cadastro@sada.com.br', '(31) 3071-0700',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'BRAZUL TRANSPORTES', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CATSUL GUAIBA - TRANSPORTES HIDROVIARIOS LTDA', 'CATSUL GUAIBA - TRANSPORTES HIDROVIARIOS LTDA',
    '12998170000277', 'ivan.didio@ouroeprata.com', '(51) 3375-8561',
    'Hugo Eugênio Fleck', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Hugo Eugênio Fleck","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CATSUL GUAIBA - TRANSPORTES HIDROVIARIOS LTDA', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'COOPERATIVA CENTRAL GAUCHA LTDA', 'CCGL',
    '88933114003150', 'marcelo@ccgl.com.br', '(55) 3321-9400',
    'Caio Cézar Vianna', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Caio Cézar Vianna","municipio":"SANTA ROSA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CCGL', 'QUALIFICADO',
    NULL, 25, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"E","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CHLORUM BRASIL INDUSTRIA LTDA', 'CHLORUM BR',
    '20034081000239', NULL, '(11) 2307-3955',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'CHLORUM BR', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'COMERCIAL ZAFFARI LTDA', 'Comercial Zaffari',
    '92016757000191', 'gmatto.s@zaffarinet.com.br', '(54) 3100-0076',
    'SERGIO ZAFFARI', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"SERGIO ZAFFARI","municipio":"PASSO FUNDO","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'Comercial Zaffari', 'REUNIÃO',
    NULL, 45, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"E","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'EXPRESSO NEPOMUCENO S/A', 'EXPRESSO NEPOBUCENO',
    '19368927004447', 'tributario@expressonepomucemo.com.br', '(35) 3694-9896',
    'Agnésio Carvalho de Souza', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Agnésio Carvalho de Souza","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'EXPRESSO NEPOBUCENO', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'GERDAU ACOS LONGOS S.A.', 'GERDAU',
    '07358761020437', 'cpg-dteicms@gerdau.com.br', '(11) 3094-6600',
    'Gustavo Werneck', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Gustavo Werneck","municipio":"PORTO ALEGRE","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'GERDAU', 'REUNIÃO',
    NULL, 45, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"E","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'MASAL S A INDUSTRIA E COMERCIO', 'MASAL',
    '96299219000102', 'masal@masal.com.br', NULL,
    'Cláudio Bier', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Cláudio Bier","municipio":"SANTO ANTONIO DA PATRULHA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'MASAL', 'QUALIFICADO',
    NULL, 25, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'Grupo Meridian', 'Meridian',
    NULL, 'rlopes@meridian.com', '(51) 3233-1122',
    'Roberto Lopes', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Roberto Lopes","municipio":"São Paulo","uf":"SP"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'Meridian', 'PROPOSTA_ENVIADA',
    NULL, 65, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'NORTEL SUPRIMENTOS INDUSTRIAIS LTDA', 'NORTEL SUPRIMENTOS',
    '46044053010500', 'juridico.tributario@sonepar.com.br', '(19) 2102-7700',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'NORTEL SUPRIMENTOS', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'POLIMIX CONCRETO LTDA', 'POLIMIX',
    '29067113044304', 'fiscalcdc@polimix.com.br', '(11) 4168-0300',
    NULL, '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":null,"municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'POLIMIX', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'REITER TRANSPORTES E LOGISTICA LTDA', 'REITERLOG GUAIBA',
    '10466983002587', 'michel.paiva@reiterlog.com', '(51) 3479-4100',
    'Vinícius Reiter Pilz', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Vinícius Reiter Pilz","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'REITERLOG GUAIBA', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'R. SCHAEFFER CONSTRUCOES LTDA - EM RECUPERACAO JUDICIAL', 'SCHAEFFER (RJ)',
    '03329452000371', 'rschaeffer@rschaeffer.com.br', '(51) 3511-9000',
    'Raul Schaeffer', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Raul Schaeffer","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'SCHAEFFER (RJ)', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"M","lead_source":null}'::jsonb
  );
END $$;

DO $$ DECLARE cid uuid := gen_random_uuid(); BEGIN
  INSERT INTO contacts (id, organization_id, name, company, cnpj, email, phone, position, created_by, custom_fields)
  VALUES (
    cid, '19a2d40b-36ea-4668-8941-6496ecf7df67', 'VIX TRANSPORTES DEDICADOS LTDA', 'VIX TRANSPORTES',
    '09452900003593', 'contabilidade.log@vix.com.br', '(27) 2125-1800',
    'Patrícia Poupel Chieppe', '78524d79-66ad-413e-ad69-9f09bf23d45c', '{"tipo_pessoa":"pj","cpf":null,"contact_person":"Patrícia Poupel Chieppe","municipio":"GUAIBA","uf":"RS"}'::jsonb
  );
  INSERT INTO opportunities (funnel_id, organization_id, title, stage, value, probability, description, owner_id, contact_id, custom_fields)
  VALUES (
    'f6ff0447-3d5d-4d66-88d4-ac434a01b578', '19a2d40b-36ea-4668-8941-6496ecf7df67', 'VIX TRANSPORTES', 'LEADS',
    NULL, 10, NULL,
    '78524d79-66ad-413e-ad69-9f09bf23d45c', cid, '{"tier":"G","lead_source":null}'::jsonb
  );
END $$;

COMMIT;