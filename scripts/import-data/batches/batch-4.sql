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