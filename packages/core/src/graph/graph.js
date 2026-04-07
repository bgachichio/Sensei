import { nanoid } from 'nanoid';

/**
 * KnowledgeGraph - Manages entities, relations, and graph queries
 */
export class KnowledgeGraph {
  constructor(database) {
    this.db = database;
  }

  /**
   * Register or update an entity
   */
  upsertEntity(type, name, metadata = {}) {
    let entity = this.db.findEntity(name, type);
    if (entity) {
      this.db.upsertEntity({ ...entity, metadata: { ...JSON.parse(entity.metadata || '{}'), ...metadata } });
      return entity;
    }
    const id = `${type}_${nanoid(8)}`;
    this.db.upsertEntity({ id, type, name, metadata });
    return { id, type, name, metadata };
  }

  /**
   * Add a relation between two entities
   */
  addRelation(sourceEntityId, targetEntityId, relationType, { strength = 1.0, context = '', sourceArticleId = null } = {}) {
    const id = `rel_${nanoid(8)}`;
    this.db.addRelation({ id, sourceEntityId, targetEntityId, relationType, strength, context, sourceArticleId });
    return id;
  }

  /**
   * Process extracted entities from AI and link them to an article
   */
  processExtraction(articleId, extraction) {
    const entityIds = [];

    for (const ent of extraction.entities || []) {
      const entity = this.upsertEntity(ent.type, ent.name, { role: ent.role });
      this.db.linkArticleEntity(articleId, entity.id, ent.role || 'mentioned');
      entityIds.push(entity.id);
    }

    // Create relations between entities co-occurring in this article
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        this.addRelation(entityIds[i], entityIds[j], 'co_occurs', {
          strength: 0.5,
          context: `Co-occurring in article`,
          sourceArticleId: articleId
        });
      }
    }

    // Process decisions as entities
    for (const dec of extraction.decisions || []) {
      const entity = this.upsertEntity('decision', dec.what, { context: dec.context });
      this.db.linkArticleEntity(articleId, entity.id, 'decided');
    }

    // Process commitments
    for (const com of extraction.commitments || []) {
      const entity = this.upsertEntity('commitment', com.what, { who: com.who, deadline: com.deadline });
      this.db.linkArticleEntity(articleId, entity.id, 'committed');
    }

    return entityIds;
  }

  /**
   * Get the full context for a person entity
   */
  getPersonDossier(name) {
    const entity = this.db.findEntity(name, 'person');
    if (!entity) return null;

    const articles = this.db.getEntityArticles(entity.id);
    const relations = this.db.getEntityRelations(entity.id);

    return {
      entity,
      articles,
      relations,
      metadata: JSON.parse(entity.metadata || '{}')
    };
  }

  /**
   * Get the full graph data for visualisation
   */
  getGraphData({ entityType = null, limit = 200 } = {}) {
    const entities = this.db.listEntities(entityType, limit);
    const nodes = entities.map(e => ({
      id: e.id,
      label: e.name,
      type: e.type,
      metadata: JSON.parse(e.metadata || '{}')
    }));

    const nodeIds = new Set(nodes.map(n => n.id));
    const allRelations = [];

    for (const entity of entities) {
      const rels = this.db.getEntityRelations(entity.id);
      for (const rel of rels) {
        if (nodeIds.has(rel.source_entity_id) && nodeIds.has(rel.target_entity_id)) {
          allRelations.push({
            source: rel.source_entity_id,
            target: rel.target_entity_id,
            type: rel.relation_type,
            strength: rel.strength
          });
        }
      }
    }

    // Deduplicate edges
    const edgeMap = new Map();
    for (const rel of allRelations) {
      const key = [rel.source, rel.target].sort().join('::');
      if (!edgeMap.has(key)) edgeMap.set(key, rel);
    }

    return { nodes, edges: Array.from(edgeMap.values()) };
  }
}
