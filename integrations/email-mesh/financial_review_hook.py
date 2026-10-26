"""Bounded receipt-review hook for the existing BudgetX job. No new scheduler."""


def run_review_hook(config, *, allow_publication=True, store_factory=None, processor=None, notifier=None):
    if config.get('financial_review_enabled') is not True:
        return {'enabled': False}
    import sqlite3
    from contextlib import closing
    from pathlib import Path
    from mesh import validate_config
    validate_config(config)
    if store_factory is None:
        from financial_review import ReviewStore
        store_factory = ReviewStore
    if processor is None:
        from financial_review_apply import process_reviews
        processor = process_reviews
    if notifier is None:
        from financial_review import notify_reviews
        notifier = notify_reviews
    with store_factory(config) as store:
        with closing(sqlite3.connect(Path(config['db_path']).as_uri() + '?mode=ro')) as db:
            db.row_factory = sqlite3.Row
            db.execute('BEGIN')
            discovered = store.discover(db)
        processed = {'posted': 0, 'deferred': 0}
        publication_error = ''
        if allow_publication and config.get('publish_enabled') is True:
            try:
                processed = processor(config, store, limit=3)
            except Exception as error:
                publication_error = type(error).__name__
        notices = notifier(config, store, limit=3)
        notification_error = 'FinancialReviewNotificationDeferred' if notices.get('failed') or notices.get('outstanding_failed') else ''
        rows = store.rows()
        return {'enabled': True, 'discovered': discovered, 'publication_error': publication_error,
                'notification_error': notification_error,
                'pending': sum(r['state'] in ('pending', 'approved', 'prepared', 'blocked') for r in rows),
                'approved': sum(r['state'] in ('approved', 'prepared') for r in rows),
                'posted': processed.get('posted', 0), 'deferred': processed.get('deferred', 0),
                'notifications': notices}


def main(argv=None):
    import argparse
    import fcntl
    import json
    import os
    from pathlib import Path
    from mesh import load_config
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--notify-only', action='store_true')
    args = parser.parse_args(argv)
    os.umask(0o077)
    try:
        config = load_config(args.config)
        lock_path = Path(config['db_path']).parent / 'financial-review-hook.lock'
        with lock_path.open('a') as lock:
            os.fchmod(lock.fileno(), 0o600)
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print(json.dumps({'enabled': True, 'busy': True}))
                return 0
            try:
                from financial_review_web import run_web_review_hook
                result = run_web_review_hook(config, allow_publication=not args.notify_only)
            except ImportError:
                result = run_review_hook(config, allow_publication=not args.notify_only)
        print(json.dumps(result))
        return 1 if result.get('publication_error') or result.get('notification_error') or result.get('web_error') else 0
    except Exception as error:
        print(json.dumps({'error': type(error).__name__, 'action': 'Review queue retained; inspect private state, do not reset/replay'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
